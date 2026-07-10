"use client";

import * as React from "react";
import { BarChart3, Clock3, RefreshCw } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { pastelBarColor } from "@/lib/chart-palette";
import { getScopedStorageKey } from "@/lib/master-company-scope";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import { cn, formatNumber, formatTime, toDateTimeLocalValue } from "@/lib/utils";

type ScenarioComparisonCardProps = {
  autoRefresh?: boolean;
  companyId?: string | null;
  description?: string;
  scenarios: Scenario[];
  storageKey: string;
  title?: string;
};

type ScenarioCompareGranularity = "hour" | "day" | "week" | "month";
type ScenarioComparePeriod =
  | "today"
  | "yesterday"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "custom";
type ScenarioSelectionMode = "all" | "custom";

type ScenarioComparisonSettings = {
  customFrom: string;
  customTo: string;
  granularity: ScenarioCompareGranularity;
  period: ScenarioComparePeriod;
  selectedScenarioIds: string[];
  selectionMode: ScenarioSelectionMode;
};

type AggregateDefinition = {
  granularity: AggregateGranularity;
  from: Date;
  to: Date;
};

type ChartPoint = {
  id: string;
  name: string;
  total: number;
};

type ScenarioComparisonSeries = {
  id: string;
  name: string;
  points: ChartPoint[];
};

type AggregateIdentityTotal = {
  cameraId: string;
  lineCountId: string;
  metricType: string;
  objectClass: string;
  total: number;
};

const DEFAULT_METRIC_TYPE = "count";
const REFRESH_MS = 5_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_SCENARIO_SERIES = 12;

const granularityOptions: Array<{
  label: string;
  value: ScenarioCompareGranularity;
}> = [
  { label: "Hora a hora", value: "hour" },
  { label: "Dia a dia", value: "day" },
  { label: "Semana a semana", value: "week" },
  { label: "Mês a mês", value: "month" },
];

const periodOptions: Array<{ label: string; value: ScenarioComparePeriod }> = [
  { label: "Hoje", value: "today" },
  { label: "Ontem", value: "yesterday" },
  { label: "Últimas 24h", value: "last_24h" },
  { label: "Últimos 7 dias", value: "last_7d" },
  { label: "Últimos 30 dias", value: "last_30d" },
  { label: "Personalizado", value: "custom" },
];

export function ScenarioComparisonCard({
  autoRefresh = false,
  companyId,
  description = "Compare os cenários escolhidos no mesmo gráfico.",
  scenarios,
  storageKey,
  title = "Cenários por período",
}: ScenarioComparisonCardProps) {
  const [settings, setSettings] = React.useState<ScenarioComparisonSettings>(
    () => defaultSettings(),
  );
  const [rows, setRows] = React.useState<AggregateEventRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [settingsReady, setSettingsReady] = React.useState(false);
  const [definition, setDefinition] = React.useState<AggregateDefinition>(() =>
    buildScenarioComparisonDefinition(defaultSettings(), new Date()),
  );
  const selectedScenarios = React.useMemo(
    () => selectScenarios(scenarios, settings),
    [scenarios, settings],
  );
  const series = React.useMemo(
    () =>
      selectedScenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        points: buildScenarioComparisonPoints(scenario, rows, definition),
      })),
    [definition, rows, selectedScenarios],
  );
  const hasData = series.some((item) =>
    item.points.some((point) => point.total !== 0),
  );
  const option = React.useMemo(
    () => buildScenarioComparisonChartOption(series, settings.granularity),
    [series, settings.granularity],
  );

  const load = React.useCallback(
    async (silent = false) => {
      if (!scenarios.length) {
        setRows([]);
        setError("");
        setLoading(false);
        setDefinition(buildScenarioComparisonDefinition(settings, new Date()));
        return;
      }

      if (settings.selectionMode === "custom" && !settings.selectedScenarioIds.length) {
        setRows([]);
        setError("");
        setLoading(false);
        setDefinition(buildScenarioComparisonDefinition(settings, new Date()));
        return;
      }

      if (!silent) setLoading(true);
      setError("");

      try {
        const now = new Date();
        const nextDefinition = buildScenarioComparisonDefinition(settings, now);
        const nextRows = await fetchScenarioComparisonRows(
          nextDefinition,
          companyId,
        );

        setDefinition(nextDefinition);
        setRows(nextRows);
        setLastUpdated(now);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar a comparação de cenários.",
        );
      } finally {
        setLoading(false);
      }
    },
    [companyId, scenarios.length, settings],
  );

  React.useEffect(() => {
    setSettingsReady(false);
    setSettings(loadSettings(storageKey, companyId));
    setSettingsReady(true);
  }, [companyId, storageKey]);

  React.useEffect(() => {
    setSettings((current) => ({
      ...current,
      selectedScenarioIds: current.selectedScenarioIds.filter((id) =>
        scenarios.some((scenario) => scenario.id === id),
      ),
    }));
  }, [scenarios]);

  React.useEffect(() => {
    if (!settingsReady) return;
    saveSettings(storageKey, companyId, settings);
  }, [companyId, settings, settingsReady, storageKey]);

  React.useEffect(() => {
    if (!settingsReady) return;
    load();
  }, [load, settingsReady]);

  React.useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [autoRefresh, load]);

  function updateSettings(next: Partial<ScenarioComparisonSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function toggleScenario(scenarioId: string) {
    setSettings((current) => ({
      ...current,
      selectedScenarioIds: current.selectedScenarioIds.includes(scenarioId)
        ? current.selectedScenarioIds.filter((id) => id !== scenarioId)
        : [...current.selectedScenarioIds, scenarioId],
    }));
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated)}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[160px_170px_180px_minmax(0,1fr)]">
          <Field label="Granularidade">
            <Select
              value={settings.granularity}
              onValueChange={(value) =>
                updateSettings({ granularity: value as ScenarioCompareGranularity })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {granularityOptions.map((optionItem) => (
                  <SelectItem key={optionItem.value} value={optionItem.value}>
                    {optionItem.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Período">
            <Select
              value={settings.period}
              onValueChange={(value) =>
                updateSettings({ period: value as ScenarioComparePeriod })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((optionItem) => (
                  <SelectItem key={optionItem.value} value={optionItem.value}>
                    {optionItem.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Cenários">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={settings.selectionMode === "all" ? "default" : "outline"}
                onClick={() => updateSettings({ selectionMode: "all" })}
              >
                Todos
              </Button>
              <Button
                type="button"
                variant={settings.selectionMode === "custom" ? "default" : "outline"}
                onClick={() => updateSettings({ selectionMode: "custom" })}
              >
                Escolher
              </Button>
            </div>
          </Field>

          {settings.period === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="De">
                <Input
                  type="datetime-local"
                  value={settings.customFrom}
                  onChange={(event) =>
                    updateSettings({ customFrom: event.target.value })
                  }
                />
              </Field>
              <Field label="Até">
                <Input
                  type="datetime-local"
                  value={settings.customTo}
                  onChange={(event) =>
                    updateSettings({ customTo: event.target.value })
                  }
                />
              </Field>
            </div>
          ) : (
            <div className="flex items-end">
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {periodLabel(settings.period)} · {granularityLabel(settings.granularity)}
              </div>
            </div>
          )}
        </div>

        {settings.selectionMode === "custom" ? (
          <div className="max-h-[190px] overflow-y-auto rounded-md border bg-background p-2">
            {scenarios.length ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {scenarios.map((scenario) => {
                  const selected = settings.selectedScenarioIds.includes(scenario.id);

                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      className={cn(
                        "min-w-0 rounded-md border px-3 py-2 text-left text-sm transition",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                      onClick={() => toggleScenario(scenario.id)}
                    >
                      <span className="block truncate font-medium">
                        {scenario.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {formatNumber(scenario.lines?.length ?? 0)} linhas
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                Nenhum cenário disponível.
              </div>
            )}
          </div>
        ) : null}

        <div className="h-[360px] w-full">
          {loading && !rows.length ? (
            <Skeleton className="h-full w-full" />
          ) : error ? (
            <ChartState text={error} />
          ) : settings.selectionMode === "custom" &&
            !settings.selectedScenarioIds.length ? (
            <ChartState text="Selecione ao menos um cenário para comparar." />
          ) : !selectedScenarios.length ? (
            <ChartState text="Nenhum cenário disponível para comparar." />
          ) : hasData ? (
            <EChart option={option} />
          ) : (
            <ChartState text="Sem eventos nos cenários selecionados para este período." />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ChartState({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

async function fetchScenarioComparisonRows(
  definition: AggregateDefinition,
  companyId?: string | null,
) {
  const headers = companyHeaders(companyId);
  const rows = await fetchAggregateRows(definition, headers);
  const openBucket = currentOpenBucket(definition.granularity, new Date());
  const sourceGranularity = sourceGranularityForOpenBucket(definition.granularity);

  if (
    !sourceGranularity ||
    !rangesOverlap(definition.from, definition.to, openBucket.from, openBucket.to)
  ) {
    return rows;
  }

  const sourceRows = await fetchAggregateRows(
    {
      granularity: sourceGranularity,
      from: openBucket.from,
      to: openBucket.to,
    },
    headers,
  );

  return replaceOpenBucketRowsFromSource(
    rows,
    definition.granularity,
    openBucket.from,
    sourceRows,
    openBucket.from,
    openBucket.to,
  );
}

async function fetchAggregateRows(
  definition: AggregateDefinition,
  headers?: HeadersInit,
) {
  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: definition.from.toISOString(),
    metric_type: DEFAULT_METRIC_TYPE,
    to: definition.to.toISOString(),
  });
  const response = await apiFetch<AggregateEventsResponse>(
    `/analytics/aggregate?${params.toString()}`,
    { headers },
  );

  return response.data ?? [];
}

function buildScenarioComparisonDefinition(
  settings: ScenarioComparisonSettings,
  now: Date,
): AggregateDefinition {
  const range = scenarioComparisonRange(settings, now);

  return {
    granularity: settings.granularity,
    from: alignToGranularity(range.from, settings.granularity),
    to: alignEndToGranularity(range.to, settings.granularity),
  };
}

function scenarioComparisonRange(settings: ScenarioComparisonSettings, now: Date) {
  if (settings.period === "custom") {
    const from = parseLocalDateTime(settings.customFrom);
    const to = parseLocalDateTime(settings.customTo);
    if (from && to && from < to) return { from, to };
  }

  if (settings.period === "yesterday") {
    const todayStart = startOfDay(now);
    return { from: addDays(todayStart, -1), to: todayStart };
  }

  if (settings.period === "last_24h") {
    return { from: addHours(now, -24), to: now };
  }

  if (settings.period === "last_7d") {
    return { from: startOfDay(addDays(now, -6)), to: now };
  }

  if (settings.period === "last_30d") {
    return { from: startOfDay(addDays(now, -29)), to: now };
  }

  return { from: startOfDay(now), to: now };
}

function selectScenarios(
  scenarios: Scenario[],
  settings: ScenarioComparisonSettings,
) {
  if (settings.selectionMode === "all") {
    return scenarios.slice(0, MAX_SCENARIO_SERIES);
  }

  const selectedIds = new Set(settings.selectedScenarioIds);
  return scenarios
    .filter((scenario) => selectedIds.has(scenario.id))
    .slice(0, MAX_SCENARIO_SERIES);
}

function buildScenarioComparisonPoints(
  scenario: Scenario,
  rows: AggregateEventRow[],
  definition: AggregateDefinition,
): ChartPoint[] {
  return listBucketStarts(definition).map((bucketStart) => {
    const next = addGranularity(bucketStart, definition.granularity);

    return {
      id: bucketStart.toISOString(),
      name: bucketLabel(bucketStart, definition.granularity),
      total: sumScenarioRowsInRange(rows, scenario, bucketStart, next),
    };
  });
}

function buildScenarioComparisonChartOption(
  series: ScenarioComparisonSeries[],
  granularity: ScenarioCompareGranularity,
): EnterpriseChartOption {
  const bucketLabels = series[0]?.points.map((point) => point.name) ?? [];
  const dense = bucketLabels.length > 12;

  return {
    color: series.map((_, index) => pastelBarColor(index)),
    grid: {
      bottom: dense ? 34 : 18,
      containLabel: true,
      left: 42,
      right: 18,
      top: series.length > 1 ? 58 : 28,
    },
    legend:
      series.length > 1
        ? {
            itemGap: 12,
            itemHeight: 10,
            itemWidth: 10,
            left: 0,
            right: 0,
            textStyle: {
              color: "#526477",
              fontSize: 12,
            },
            top: 0,
            type: "scroll",
          }
        : undefined,
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
          : `${formatNumber(Number(value))} eventos`,
    },
    xAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
        hideOverlap: true,
        interval: 0,
        rotate: dense ? 24 : 0,
      },
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
      },
      axisTick: {
        show: false,
      },
      data: bucketLabels,
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: "#66758A",
        fontSize: 11,
      },
      minInterval: 1,
      splitLine: {
        lineStyle: {
          color: "#E8EEF6",
        },
      },
      type: "value",
    },
    series: series.map((item, index) => ({
      barCategoryGap: series.length > 4 ? "28%" : "38%",
      barGap: "8%",
      barMaxWidth: granularity === "hour" ? 18 : 28,
      data: item.points.map((point) => point.total),
      emphasis: {
        focus: "series",
        itemStyle: {
          color: pastelBarColor(index),
        },
      },
      itemStyle: {
        borderRadius: [3, 3, 0, 0],
        color: pastelBarColor(index),
      },
      name: item.name,
      type: "bar",
    })),
  };
}

function sumScenarioRowsInRange(
  rows: AggregateEventRow[],
  scenario: Scenario,
  from: Date,
  to: Date,
) {
  const multipliers = scenarioMultiplierMap(scenario);
  const fromTime = from.getTime();
  const toTime = to.getTime();

  return rows.reduce((sum, row) => {
    const multiplier = row.line_count_id
      ? multipliers.get(row.line_count_id)
      : undefined;
    if (multiplier === undefined) return sum;

    const bucket = new Date(row.bucket).getTime();
    if (Number.isNaN(bucket) || bucket < fromTime || bucket >= toTime) {
      return sum;
    }

    return sum + (row.total ?? 0) * multiplier;
  }, 0);
}

function scenarioMultiplierMap(scenario: Scenario) {
  return new Map(
    scenario.lines
      ?.filter((line) => line.action_multiplier !== 0)
      .map((line) => [line.line_count_id, line.action_multiplier ?? 1]) ?? [],
  );
}

function replaceOpenBucketRowsFromSource(
  rows: AggregateEventRow[],
  targetGranularity: AggregateGranularity,
  bucketStart: Date,
  sourceRows: AggregateEventRow[],
  sourceFrom: Date,
  sourceTo: Date,
) {
  const targetKey = bucketKeyForGranularity(bucketStart, targetGranularity);
  const replacementRows = aggregateRowsIntoBucket(
    sourceRows,
    sourceFrom,
    sourceTo,
  ).map((row) => ({
    ...row,
    bucket: bucketStart.toISOString(),
  }));

  return [
    ...rows.filter((row) => {
      const rowDate = new Date(row.bucket);
      if (Number.isNaN(rowDate.getTime())) return true;
      return bucketKeyForGranularity(rowDate, targetGranularity) !== targetKey;
    }),
    ...replacementRows,
  ];
}

function aggregateRowsIntoBucket(
  rows: AggregateEventRow[],
  from: Date,
  to: Date,
) {
  const fromTime = from.getTime();
  const toTime = to.getTime();
  const totals = new Map<string, AggregateIdentityTotal>();

  rows.forEach((row) => {
    const bucket = new Date(row.bucket).getTime();
    if (Number.isNaN(bucket) || bucket < fromTime || bucket >= toTime) return;

    const identity = rowIdentity(row);
    const key = rowIdentityKey(identity);
    const current = totals.get(key) ?? { ...identity, total: 0 };
    current.total += row.total ?? 0;
    totals.set(key, current);
  });

  return Array.from(totals.values()).map((identity) =>
    createAggregateRow(from, identity),
  );
}

function rowIdentity(row: AggregateEventRow) {
  return {
    cameraId: row.camera_id ?? "",
    lineCountId: row.line_count_id ?? "",
    metricType: row.metric_type ?? DEFAULT_METRIC_TYPE,
    objectClass: row.object_class ?? "",
  };
}

function rowIdentityKey(identity: Omit<AggregateIdentityTotal, "total">) {
  return [
    identity.cameraId,
    identity.lineCountId,
    identity.metricType,
    identity.objectClass,
  ].join("|");
}

function createAggregateRow(
  bucket: Date,
  identity: AggregateIdentityTotal,
): AggregateEventRow {
  return {
    bucket: bucket.toISOString(),
    camera_id: identity.cameraId,
    line_count_id: identity.lineCountId || undefined,
    metric_type: identity.metricType || DEFAULT_METRIC_TYPE,
    object_class: identity.objectClass || undefined,
    total: identity.total,
  };
}

function listBucketStarts(definition: AggregateDefinition) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(definition.from, definition.granularity);
  const end = alignEndToGranularity(definition.to, definition.granularity);
  let guard = 0;

  while (cursor < end && guard < 1000) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, definition.granularity);
    guard += 1;
  }

  return starts;
}

function alignToGranularity(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return startOfMinute(date);
  if (granularity === "hour") return startOfHour(date);
  if (granularity === "day") return startOfDay(date);
  if (granularity === "week") return startOfWeek(date);
  if (granularity === "month") return startOfMonth(date);
  return startOfDay(date);
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
  return addDays(date, 1);
}

function bucketKeyForGranularity(date: Date, granularity: AggregateGranularity) {
  return alignToGranularity(date, granularity).getTime();
}

function bucketLabel(date: Date, granularity: AggregateGranularity) {
  if (granularity === "minute") return formatTime(date);
  if (granularity === "hour") return `${String(date.getHours()).padStart(2, "0")}h`;
  if (granularity === "day") {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date);
  }
  if (granularity === "week") {
    const end = addDays(date, 6);
    return `${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(date)}-${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(end)}`;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function currentOpenBucket(granularity: AggregateGranularity, now: Date) {
  const from = alignToGranularity(now, granularity);
  return {
    from,
    to: addGranularity(from, granularity),
  };
}

function sourceGranularityForOpenBucket(
  granularity: AggregateGranularity,
): AggregateGranularity | null {
  if (granularity === "hour") return "minute";
  if (granularity === "day") return "hour";
  if (granularity === "week" || granularity === "month") return "day";
  return null;
}

function rangesOverlap(leftFrom: Date, leftTo: Date, rightFrom: Date, rightTo: Date) {
  return leftFrom < rightTo && rightFrom < leftTo;
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

function parseLocalDateTime(value: string) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function companyHeaders(companyId?: string | null) {
  const cleanCompanyId = companyId?.trim();
  return cleanCompanyId ? { "X-Company-ID": cleanCompanyId } : undefined;
}

function defaultSettings(): ScenarioComparisonSettings {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return {
    customFrom: toDateTimeLocalValue(start),
    customTo: toDateTimeLocalValue(new Date()),
    granularity: "hour",
    period: "today",
    selectedScenarioIds: [],
    selectionMode: "all",
  };
}

function loadSettings(storageKey: string, companyId?: string | null) {
  if (typeof window === "undefined") return defaultSettings();

  try {
    const stored = window.localStorage.getItem(settingsStorageKey(storageKey, companyId));
    if (!stored) return defaultSettings();

    const parsed = JSON.parse(stored) as Partial<ScenarioComparisonSettings>;
    return normalizeSettings(parsed);
  } catch {
    return defaultSettings();
  }
}

function saveSettings(
  storageKey: string,
  companyId: string | null | undefined,
  settings: ScenarioComparisonSettings,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    settingsStorageKey(storageKey, companyId),
    JSON.stringify(settings),
  );
}

function settingsStorageKey(storageKey: string, companyId?: string | null) {
  return getScopedStorageKey(`ipxdata.${storageKey}.scenario-comparison.v1`, companyId);
}

function normalizeSettings(
  settings: Partial<ScenarioComparisonSettings>,
): ScenarioComparisonSettings {
  const fallback = defaultSettings();

  return {
    customFrom:
      typeof settings.customFrom === "string"
        ? settings.customFrom
        : fallback.customFrom,
    customTo:
      typeof settings.customTo === "string" ? settings.customTo : fallback.customTo,
    granularity: isScenarioCompareGranularity(settings.granularity)
      ? settings.granularity
      : fallback.granularity,
    period: isScenarioComparePeriod(settings.period)
      ? settings.period
      : fallback.period,
    selectedScenarioIds: Array.isArray(settings.selectedScenarioIds)
      ? settings.selectedScenarioIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    selectionMode:
      settings.selectionMode === "custom" || settings.selectionMode === "all"
        ? settings.selectionMode
        : fallback.selectionMode,
  };
}

function isScenarioCompareGranularity(
  value: unknown,
): value is ScenarioCompareGranularity {
  return value === "hour" || value === "day" || value === "week" || value === "month";
}

function isScenarioComparePeriod(value: unknown): value is ScenarioComparePeriod {
  return (
    value === "today" ||
    value === "yesterday" ||
    value === "last_24h" ||
    value === "last_7d" ||
    value === "last_30d" ||
    value === "custom"
  );
}

function periodLabel(value: ScenarioComparePeriod) {
  return periodOptions.find((option) => option.value === value)?.label ?? "Hoje";
}

function granularityLabel(value: ScenarioCompareGranularity) {
  return (
    granularityOptions.find((option) => option.value === value)?.label ??
    "Hora a hora"
  );
}
