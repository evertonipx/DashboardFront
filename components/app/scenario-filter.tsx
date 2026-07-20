"use client";

import * as React from "react";
import {
  BarChart3,
  CalendarDays,
  FileText,
  RefreshCw,
  Route,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { CardLayout } from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/components/app/auth-provider";
import { parseAggregateBucket } from "@/lib/aggregate-time";
import { apiFetch } from "@/lib/api";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import type {
  AnalyticsEventRow,
  DailyEventsResponse,
  HourlyEventsResponse,
  Scenario,
  ScenarioResult,
} from "@/lib/types";
import {
  cn,
  formatDateTime,
  formatNumber,
  toDateTimeLocalValue,
} from "@/lib/utils";

type ScenarioFilterProps = {
  manager?: boolean;
  refreshKey?: number;
};

type Preset = "today" | "yesterday" | "last_24h" | "last_7d" | "custom";
type ScenarioChartView = "hourly" | "daily";

type ChartPoint = {
  bucket: string;
  label: string;
  total: number;
};

type DateRange = {
  from: Date;
  to: Date;
};

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

const presets: Array<{ value: Preset; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_24h", label: "Últimas 24h" },
  { value: "last_7d", label: "Últimos 7 dias" },
  { value: "custom", label: "Personalizado" },
];

export function ScenarioFilter({
  manager = false,
  refreshKey = 0,
}: ScenarioFilterProps) {
  const { user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [preset, setPreset] = React.useState<Preset>("today");
  const [customFrom, setCustomFrom] = React.useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return toDateTimeLocalValue(start);
  });
  const [customTo, setCustomTo] = React.useState(() =>
    toDateTimeLocalValue(new Date()),
  );
  const [appliedRange, setAppliedRange] = React.useState(() =>
    resolveRange("today", customFrom, customTo),
  );
  const [reportResults, setReportResults] = React.useState<
    Record<string, ScenarioResult | null>
  >({});
  const [chartView, setChartView] =
    React.useState<ScenarioChartView>("hourly");
  const [scenarioChartRows, setScenarioChartRows] = React.useState<
    AnalyticsEventRow[]
  >([]);
  const [previousScenarioChartRows, setPreviousScenarioChartRows] =
    React.useState<AnalyticsEventRow[]>([]);
  const [previousSelectedResult, setPreviousSelectedResult] =
    React.useState<ScenarioResult | null>(null);
  const [loadingScenarios, setLoadingScenarios] = React.useState(true);
  const [loadingReport, setLoadingReport] = React.useState(false);
  const [loadingScenarioChart, setLoadingScenarioChart] = React.useState(false);

  const selectedScenario = React.useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedId) ?? null,
    [scenarios, selectedId],
  );
  const selectedResult = selectedId ? reportResults[selectedId] ?? null : null;
  const draftRange = React.useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [customFrom, customTo, preset],
  );
  const previousRange = React.useMemo(
    () => (appliedRange ? getPreviousRange(appliedRange) : null),
    [appliedRange],
  );
  const reportSummary = React.useMemo(() => {
    const results = scenarios
      .map((scenario) => reportResults[scenario.id])
      .filter(Boolean) as ScenarioResult[];

    return {
      scenarioCount: scenarios.length,
      resultTotal: results.reduce((sum, result) => sum + result.result, 0),
      eventTotal: results.reduce((sum, result) => sum + result.event_count, 0),
      withData: results.filter((result) => result.event_count > 0).length,
    };
  }, [reportResults, scenarios]);
  const currentScenarioPoints = React.useMemo(() => {
    if (!selectedScenario || !appliedRange) return [];
    return buildScenarioBuckets(
      scenarioChartRows,
      selectedScenario,
      appliedRange,
      chartView,
    );
  }, [appliedRange, chartView, scenarioChartRows, selectedScenario]);
  const previousScenarioPoints = React.useMemo(() => {
    if (!selectedScenario || !previousRange) return [];
    return buildScenarioBuckets(
      previousScenarioChartRows,
      selectedScenario,
      previousRange,
      chartView,
    );
  }, [chartView, previousRange, previousScenarioChartRows, selectedScenario]);
  const scenarioChartOption = React.useMemo(
    () =>
      buildScenarioChartOption(
        currentScenarioPoints,
        previousScenarioPoints,
        chartView,
      ),
    [chartView, currentScenarioPoints, previousScenarioPoints],
  );
  const scenarioChartHasData = React.useMemo(
    () => currentScenarioPoints.some((point) => point.total !== 0),
    [currentScenarioPoints],
  );
  const previousResultValue = previousSelectedResult?.result ?? 0;
  const scenarioDelta = selectedResult
    ? selectedResult.result - previousResultValue
    : 0;
  const scenarioDeltaPercent =
    selectedResult && previousResultValue
      ? scenarioDelta / previousResultValue
      : null;

  const loadScenarios = React.useCallback(async () => {
    setLoadingScenarios(true);
    try {
      const data = await apiFetch<Scenario[]>("/scenarios");
      const scopedScenarios = filterScopedApiRows(data, companyScopeId);
      const visible = manager
        ? scopedScenarios
        : scopedScenarios.filter((scenario) => scenario.active);
      setScenarios(visible);
      setSelectedId((current) => {
        if (current && visible.some((scenario) => scenario.id === current)) {
          return current;
        }
        return visible[0]?.id ?? "";
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os cenários.";
      toast.error(message);
    } finally {
      setLoadingScenarios(false);
    }
  }, [companyScopeId, manager]);

  const loadReport = React.useCallback(async () => {
    if (!appliedRange || !scenarios.length) {
      setReportResults({});
      return;
    }

    setLoadingReport(true);
    const params = new URLSearchParams({
      from: appliedRange.from.toISOString(),
      to: appliedRange.to.toISOString(),
    });

    try {
      const entries = await Promise.all(
        scenarios.map(async (scenario) => {
          try {
            const result = await apiFetch<ScenarioResult>(
              `/scenarios/${scenario.id}/result?${params.toString()}`,
            );
            return [scenario.id, result] as const;
          } catch {
            return [scenario.id, null] as const;
          }
        }),
      );
      setReportResults(Object.fromEntries(entries));
    } finally {
      setLoadingReport(false);
    }
  }, [appliedRange, scenarios]);

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios, refreshKey]);

  React.useEffect(() => {
    loadReport();
  }, [loadReport]);

  React.useEffect(() => {
    if (!appliedRange) return;

    const duration = appliedRange.to.getTime() - appliedRange.from.getTime();
    if (duration > 3 * DAY_MS) {
      setChartView("daily");
    }
  }, [appliedRange]);

  React.useEffect(() => {
    if (!selectedScenario || !appliedRange || !previousRange) {
      setScenarioChartRows([]);
      setPreviousScenarioChartRows([]);
      setPreviousSelectedResult(null);
      return;
    }

    let mounted = true;
    const endpoint = chartView === "daily" ? "/analytics/daily" : "/analytics/hourly";
    const currentPath = analyticsRangePath(
      endpoint,
      appliedRange.from,
      appliedRange.to,
    );
    const previousPath = analyticsRangePath(
      endpoint,
      previousRange.from,
      previousRange.to,
    );
    const previousResultPath = scenarioResultPath(selectedScenario.id, previousRange);

    async function loadScenarioChart() {
      setLoadingScenarioChart(true);

      try {
        const [currentRows, previousRows, previousResult] = await Promise.all([
          apiFetch<HourlyEventsResponse | DailyEventsResponse>(currentPath),
          apiFetch<HourlyEventsResponse | DailyEventsResponse>(previousPath),
          apiFetch<ScenarioResult>(previousResultPath).catch(() => null),
        ]);

        if (!mounted) return;

        setScenarioChartRows(currentRows.data ?? []);
        setPreviousScenarioChartRows(previousRows.data ?? []);
        setPreviousSelectedResult(previousResult);
      } catch (error) {
        if (!mounted) return;

        setScenarioChartRows([]);
        setPreviousScenarioChartRows([]);
        setPreviousSelectedResult(null);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o gráfico do cenário.",
        );
      } finally {
        if (mounted) setLoadingScenarioChart(false);
      }
    }

    loadScenarioChart();

    return () => {
      mounted = false;
    };
  }, [appliedRange, chartView, previousRange, selectedScenario]);

  function applyDraftRange() {
    if (!draftRange) {
      toast.error("Informe um período válido.");
      return;
    }
    setAppliedRange(draftRange);
  }

  const reportCards = scenarios.length
    ? [
          {
            id: "report_total",
            node: (
              <ReportBox
                label="Resultado total"
                value={reportSummary.resultTotal}
                loading={loadingReport}
                highlight
              />
            ),
          },
          {
            id: "report_events",
            node: (
              <ReportBox
                label="Eventos contabilizados"
                value={reportSummary.eventTotal}
                loading={loadingReport}
              />
            ),
          },
          {
            id: "report_with_data",
            node: (
              <ReportBox
                label="Cenários com movimento"
                value={reportSummary.withData}
                loading={loadingReport}
              />
            ),
          },
          {
            id: "report_scenario_count",
            node: (
              <ReportBox
                label="Cenários no relatório"
                value={reportSummary.scenarioCount}
                loading={loadingReport}
              />
            ),
          },
          ...(selectedScenario
            ? [
                {
                  id: "report_chart",
                  chartTypeEnabled: true,
                  className: "sm:col-span-2 xl:col-span-3",
                  node: (
                    <Card>
                      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            Evolução do cenário
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Comparativo com o período anterior.
                          </CardDescription>
                        </div>
                        <Select
                          value={chartView}
                          onValueChange={(value) =>
                            setChartView(value as ScenarioChartView)
                          }
                        >
                          <SelectTrigger className="w-full bg-card sm:w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">Hora a hora</SelectItem>
                            <SelectItem value="daily">Dia a dia</SelectItem>
                          </SelectContent>
                        </Select>
                      </CardHeader>
                      <CardContent>
                        {loadingScenarioChart ? (
                          <Skeleton className="h-[380px] w-full" />
                        ) : scenarioChartHasData ? (
                          <div className="h-[380px] w-full">
                            <EChart option={scenarioChartOption} />
                          </div>
                        ) : (
                          <div className="flex h-[380px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                            Sem eventos nas linhas deste cenário para o período.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ),
                },
                {
                  id: "report_detail",
                  className: "sm:col-span-2 xl:col-span-1",
                  node: (
                    <Card>
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Route className="h-4 w-4 text-primary" />
                              {selectedScenario.name}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {selectedScenario.description ||
                                "Sem descrição cadastrada."}
                            </CardDescription>
                          </div>
                          <Badge
                            variant={
                              selectedScenario.active ? "success" : "secondary"
                            }
                          >
                            {selectedScenario.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                          <ScenarioMetric
                            label="Resultado"
                            value={selectedResult?.result}
                            loading={loadingReport}
                            highlight
                          />
                          <ScenarioMetric
                            label="Período anterior"
                            value={previousSelectedResult?.result}
                            loading={loadingScenarioChart}
                          />
                          <ScenarioMetric
                            label="Variação"
                            value={scenarioDelta}
                            loading={loadingReport || loadingScenarioChart}
                            description={
                              scenarioDeltaPercent === null
                                ? "sem base comparável"
                                : formatPercent(scenarioDeltaPercent)
                            }
                            signed
                            icon={
                              scenarioDelta < 0 ? (
                                <TrendingDown className="h-4 w-4" />
                              ) : (
                                <TrendingUp className="h-4 w-4" />
                              )
                            }
                          />
                        </div>

                        <Separator />

                        <div>
                          <div className="mb-2 text-sm font-medium">
                            Linhas aplicadas
                          </div>
                          {selectedScenario.lines?.length ? (
                            <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                              {selectedScenario.lines.map((line, index) => (
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
                                  <MultiplierBadge value={line.action_multiplier} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                              Nenhuma linha vinculada.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ),
                },
              ]
            : []),
          {
            id: "report_table",
            className: "sm:col-span-2 xl:col-span-4",
            node: (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Valores por cenário
                  </CardTitle>
                  <CardDescription>
                    Resumo consolidado no período aplicado.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingReport ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cenário</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Resultado</TableHead>
                            <TableHead>Eventos</TableHead>
                            <TableHead>Linhas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {scenarios.map((scenario) => {
                            const result = reportResults[scenario.id];
                            return (
                              <TableRow
                                key={scenario.id}
                                className={cn(
                                  "cursor-pointer",
                                  selectedId === scenario.id && "bg-primary/10",
                                )}
                                onClick={() => setSelectedId(scenario.id)}
                              >
                                <TableCell>
                                  <div className="font-medium">{scenario.name}</div>
                                  <div className="mt-1 max-w-[520px] truncate text-xs text-muted-foreground">
                                    {scenario.description || scenario.id}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      scenario.active ? "success" : "secondary"
                                    }
                                  >
                                    {scenario.active ? "Ativo" : "Inativo"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-semibold">
                                  {result ? formatNumber(result.result) : "-"}
                                </TableCell>
                                <TableCell>
                                  {result ? formatNumber(result.event_count) : "-"}
                                </TableCell>
                                <TableCell>
                                  {formatNumber(scenario.lines?.length ?? 0)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
          },
        ]
    : [];

  return (
    <section id="cenarios" className="scroll-mt-6 space-y-4">
      <div className="rounded-md border border-border bg-card p-4 shadow-soft">
        {loadingScenarios ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : scenarios.length ? (
          <div className="space-y-4">
            <div
              className={cn(
                "grid gap-4",
                preset === "custom"
                  ? "xl:grid-cols-[minmax(240px,1fr)_170px_190px_190px_auto]"
                  : "md:grid-cols-[minmax(240px,1fr)_170px_auto]",
              )}
            >
              <div className="space-y-2">
                <Label>Cenário</Label>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cenário" />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarios.map((scenario) => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Período</Label>
                <Select
                  value={preset}
                  onValueChange={(value) => setPreset(value as Preset)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {preset === "custom" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="custom-from">De</Label>
                    <Input
                      id="custom-from"
                      type="datetime-local"
                      value={customFrom}
                      onChange={(event) => setCustomFrom(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-to">Até</Label>
                    <Input
                      id="custom-to"
                      type="datetime-local"
                      value={customTo}
                      onChange={(event) => setCustomTo(event.target.value)}
                    />
                  </div>
                </>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  type="button"
                  className="w-full md:w-auto"
                  onClick={applyDraftRange}
                  disabled={!draftRange || loadingReport}
                >
                  <CalendarDays className="h-4 w-4" />
                  Aplicar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full md:w-auto"
                  onClick={() => {
                    loadScenarios();
                    loadReport();
                  }}
                  disabled={loadingScenarios || loadingReport}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4",
                      (loadingScenarios || loadingReport) && "animate-spin",
                    )}
                  />
                  Atualizar
                </Button>
              </div>
            </div>
            {appliedRange ? (
              <div className="text-xs text-muted-foreground">
                Período aplicado: {formatDateTime(appliedRange.from)} até{" "}
                {formatDateTime(appliedRange.to)}
              </div>
            ) : (
              <div className="text-xs text-destructive">
                Informe um período válido.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum cenário disponível para este usuário.
          </div>
        )}
      </div>

      {scenarios.length ? (
        <CardLayout menuKey="reports" cards={reportCards} />
      ) : null}

    </section>
  );
}

function ReportBox({
  label,
  value,
  loading,
  highlight = false,
}: {
  label: string;
  value: number;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-[116px] rounded-md border p-4",
        highlight ? "border-primary/30 bg-primary/5" : "bg-muted/20",
      )}
    >
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div
          className={cn(
            "mt-2 text-3xl font-semibold",
            highlight && "text-primary",
          )}
        >
          {formatNumber(value)}
        </div>
      )}
    </div>
  );
}

function ScenarioMetric({
  label,
  value,
  loading,
  highlight = false,
  description,
  signed = false,
  icon,
}: {
  label: string;
  value?: number;
  loading: boolean;
  highlight?: boolean;
  description?: string;
  signed?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-4",
        highlight ? "border-primary/30 bg-primary/5" : "bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </div>
        {icon ? <div className="text-primary">{icon}</div> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <div
          className={cn(
            "mt-2 text-2xl font-semibold",
            highlight && "text-primary",
          )}
        >
          {formatSignedNumber(value, signed)}
        </div>
      )}
      {description ? (
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      ) : null}
    </div>
  );
}

function MultiplierBadge({ value }: { value: -1 | 0 | 1 }) {
  if (value === 1) {
    return <Badge variant="success">Soma</Badge>;
  }

  if (value === -1) {
    return <Badge variant="warning">Subtrai</Badge>;
  }

  return <Badge variant="secondary">Neutro</Badge>;
}

function buildScenarioChartOption(
  currentPoints: ChartPoint[],
  previousPoints: ChartPoint[],
  view: ScenarioChartView,
): EnterpriseChartOption {
  const categories = currentPoints.map((point) => point.label);

  return {
    color: ["#1267C4", "#B7C7DA"],
    grid: {
      left: 4,
      right: 10,
      top: 42,
      bottom: 2,
      containLabel: true,
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: "#526477",
        fontSize: 12,
      },
    },
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
      data: categories,
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
        name: view === "hourly" ? "Período anterior" : "Anterior",
        type: "bar",
        data: previousPoints.map((point) => point.total),
        barMaxWidth: view === "hourly" ? 18 : 30,
        barCategoryGap: view === "hourly" ? "42%" : "50%",
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: "#B7C7DA",
        },
        emphasis: {
          itemStyle: {
            color: "#8FA5BE",
          },
        },
      },
      {
        name: view === "hourly" ? "Período atual" : "Atual",
        type: "bar",
        data: currentPoints.map((point) => point.total),
        barMaxWidth: view === "hourly" ? 18 : 30,
        barGap: "18%",
        barCategoryGap: view === "hourly" ? "42%" : "50%",
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
        emphasis: {
          itemStyle: {
            color: "#0B4EA2",
          },
        },
      },
    ],
  };
}

function buildScenarioBuckets(
  rows: AnalyticsEventRow[],
  scenario: Scenario,
  range: DateRange,
  view: ScenarioChartView,
) {
  const multipliers = new Map(
    scenario.lines
      ?.filter((line) => line.action_multiplier !== 0)
      .map((line) => [line.line_count_id, line.action_multiplier]) ?? [],
  );
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    if (!row.line_count_id) return;

    const multiplier = multipliers.get(row.line_count_id);
    if (multiplier === undefined) return;

    const date = parseAggregateBucket(
      row.bucket,
      view === "daily" ? "day" : "hour",
    );
    if (!date) return;

    const key =
      view === "daily"
        ? startOfDay(date).toISOString().slice(0, 10)
        : String(startOfHour(date).getTime());

    totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0) * multiplier);
  });

  return view === "daily"
    ? buildDailyScenarioBuckets(totals, range)
    : buildHourlyScenarioBuckets(totals, range);
}

function buildHourlyScenarioBuckets(
  totals: Map<string, number>,
  range: DateRange,
): ChartPoint[] {
  const start = startOfHour(range.from);
  const bucketCount = Math.max(
    1,
    Math.ceil((range.to.getTime() - start.getTime()) / HOUR_MS),
  );
  const longRange = bucketCount > 36;

  return Array.from({ length: bucketCount }).map((_, index) => {
    const date = new Date(start.getTime() + index * HOUR_MS);
    const label = longRange
      ? new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
        }).format(date)
      : `${String(date.getHours()).padStart(2, "0")}h`;

    return {
      bucket: date.toISOString(),
      label,
      total: totals.get(String(date.getTime())) ?? 0,
    };
  });
}

function buildDailyScenarioBuckets(
  totals: Map<string, number>,
  range: DateRange,
): ChartPoint[] {
  const start = startOfDay(range.from);
  const end = exclusiveDailyEnd(range.to);
  const bucketCount = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / DAY_MS),
  );

  return Array.from({ length: bucketCount }).map((_, index) => {
    const date = addDays(start, index);
    const key = date.toISOString().slice(0, 10);

    return {
      bucket: date.toISOString(),
      label: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }).format(date),
      total: totals.get(key) ?? 0,
    };
  });
}

function analyticsRangePath(path: string, from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    metric_type: "count",
  });

  return `${path}?${params.toString()}`;
}

function scenarioResultPath(id: string, range: DateRange) {
  const params = new URLSearchParams({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });

  return `/scenarios/${id}/result?${params.toString()}`;
}

function getPreviousRange(range: DateRange): DateRange {
  const duration = range.to.getTime() - range.from.getTime();

  return {
    from: new Date(range.from.getTime() - duration),
    to: new Date(range.to.getTime() - duration),
  };
}

function resolveRange(
  preset: Preset,
  customFrom: string,
  customTo: string,
): DateRange | null {
  const now = new Date();
  let from: Date;
  let to: Date = now;

  if (preset === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (preset === "yesterday") {
    to = new Date(now);
    to.setHours(0, 0, 0, 0);
    from = new Date(to);
    from.setDate(from.getDate() - 1);
  } else if (preset === "last_24h") {
    from = new Date(now.getTime() - DAY_MS);
  } else if (preset === "last_7d") {
    from = new Date(now.getTime() - 7 * DAY_MS);
  } else {
    from = new Date(customFrom);
    to = new Date(customTo);
  }

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to
  ) {
    return null;
  }

  return { from, to };
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

function exclusiveDailyEnd(date: Date) {
  const start = startOfDay(date);
  return start.getTime() === date.getTime() ? start : addDays(start, 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatSignedNumber(value: number | undefined, signed: boolean) {
  if (!signed) return formatNumber(value);

  return new Intl.NumberFormat("pt-BR", {
    signDisplay: "always",
  }).format(value ?? 0);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    signDisplay: "always",
    style: "percent",
  }).format(value);
}
