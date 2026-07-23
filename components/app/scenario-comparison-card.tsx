"use client";

import * as React from "react";
import { BarChart3, Clock3, Settings2 } from "lucide-react";

import { useAuth } from "@/components/app/auth-provider";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import { ScenarioPicker } from "@/components/app/scenario-picker";
import {
  useWidgetColor,
  useWidgetTitle,
} from "@/components/app/widget-appearance";
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
import {
  aggregateBucketInRange,
  aggregateQueryIso,
  parseAggregateBucket,
} from "@/lib/aggregate-time";
import {
  DAY_OF_MONTH_AXIS_LABELS,
  buildCalendarAxisLabel,
  buildCalendarMarkArea,
  holidayCategoryIndexes,
} from "@/lib/chart-calendar-axis";
import { pastelBarColor } from "@/lib/chart-palette";
import {
  buildFixedHourlyAxisValues,
  HOUR_OF_DAY_LABELS,
  latestHourlyPointHour,
} from "@/lib/hourly-axis";
import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import type { ReportPayload } from "@/lib/report-export";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import { cn, formatNumber, formatTime, toDateTimeLocalValue } from "@/lib/utils";

type ScenarioComparisonCardProps = {
  action?: React.ReactNode;
  autoRefresh?: boolean;
  companyId?: string | null;
  description?: string;
  monitorMode?: boolean;
  periodOverride?: ScenarioComparisonPeriodOverride;
  preferenceScopeId?: string | null;
  scenarios: Scenario[];
  storageKey: string;
  title?: string;
};

export type ScenarioComparisonPeriodOverride = {
  from: Date;
  label: string;
  to: Date;
};

export type ScenarioCompareGranularity = "hour" | "day" | "week" | "month";
export type ScenarioComparePeriod =
  | "today"
  | "yesterday"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "custom";
export type ScenarioComparisonView = "period" | "days_month" | "days_year";
type ScenarioSelectionMode = "all" | "custom";

export type ScenarioComparisonSettings = {
  accumulated: boolean;
  customFrom: string;
  customTo: string;
  granularity: ScenarioCompareGranularity;
  period: ScenarioComparePeriod;
  selectedScenarioIds: string[];
  selectionMode: ScenarioSelectionMode;
  view: ScenarioComparisonView;
};

export type ScenarioComparisonDefinition = {
  granularity: AggregateGranularity;
  from: Date;
  to: Date;
  accumulated: boolean;
  baselineFrom?: Date;
  baselineLabel?: string;
  baselineTo?: Date;
  currentFrom: Date;
  currentLabel?: string;
  currentTo: Date;
  view: ScenarioComparisonView;
};

type ChartPoint = {
  id: string;
  isSaturday: boolean;
  isSunday: boolean;
  name: string;
  total: number | null;
};

export type ScenarioComparisonSeries = {
  colorIndex: number;
  id: string;
  name: string;
  points: ChartPoint[];
  temporalRole?: "baseline" | "current";
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
const RECENT_DAY_RECONCILIATION_COUNT = 3;

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

const viewOptions: Array<{ label: string; value: ScenarioComparisonView }> = [
  { label: "Período configurado", value: "period" },
  { label: "Dias x mês anterior", value: "days_month" },
  { label: "Dias x mesmo mês do ano anterior", value: "days_year" },
];

export function ScenarioComparisonCard({
  action,
  autoRefresh = false,
  companyId,
  description = "Compare os cenários escolhidos no mesmo gráfico.",
  monitorMode = false,
  periodOverride,
  preferenceScopeId,
  scenarios,
  storageKey,
  title = "Cenários por período",
}: ScenarioComparisonCardProps) {
  const { user } = useAuth();
  const widgetColor = useWidgetColor();
  const resolvedTitle = useWidgetTitle(title);
  const [settings, setSettings] = React.useState<ScenarioComparisonSettings>(
    () => createDefaultScenarioComparisonSettings(),
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [rows, setRows] = React.useState<AggregateEventRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [settingsReady, setSettingsReady] = React.useState(false);
  const [definition, setDefinition] = React.useState<ScenarioComparisonDefinition>(() =>
    buildScenarioComparisonDefinition(
      createDefaultScenarioComparisonSettings(),
      new Date(),
      periodOverride,
    ),
  );
  const selectedScenarios = React.useMemo(
    () => selectScenarioComparisonScenarios(scenarios, settings),
    [scenarios, settings],
  );
  const series = React.useMemo(
    () => buildScenarioComparisonSeries(selectedScenarios, rows, definition),
    [definition, rows, selectedScenarios],
  );
  const hasData = series.some((item) =>
    item.points.some((point) => point.total !== null && point.total !== 0),
  );
  const option = React.useMemo(
    () =>
      buildScenarioComparisonChartOption(
        series,
        definition.granularity,
        widgetColor,
      ),
    [definition.granularity, series, widgetColor],
  );
  const effectiveGranularityLabel = `${granularityLabel(
    definition.granularity,
  )}${definition.granularity === settings.granularity ? "" : " (ajustada)"}`;
  const configurationSummary = `${
    periodOverride?.label ?? periodLabel(settings.period)
  } · ${viewLabel(settings.view)} · ${
    settings.accumulated ? "Acumulado" : effectiveGranularityLabel
  } · ${scenarioSelectionLabel(
    settings,
    selectedScenarios,
  )}`;

  const load = React.useCallback(
    async (silent = false) => {
      if (!companyId) {
        setRows([]);
        setError("Empresa não definida para esta comparação.");
        setLoading(false);
        return;
      }

      if (!scenarios.length) {
        setRows([]);
        setError("");
        setLoading(false);
        setDefinition(
          buildScenarioComparisonDefinition(settings, new Date(), periodOverride),
        );
        return;
      }

      if (settings.selectionMode === "custom" && !settings.selectedScenarioIds.length) {
        setRows([]);
        setError("");
        setLoading(false);
        setDefinition(
          buildScenarioComparisonDefinition(settings, new Date(), periodOverride),
        );
        return;
      }

      if (!silent) setLoading(true);
      setError("");

      try {
        const now = new Date();
        const nextDefinition = buildScenarioComparisonDefinition(
          settings,
          now,
          periodOverride,
        );
        if (nextDefinition.to <= nextDefinition.from) {
          setDefinition(nextDefinition);
          setRows([]);
          setLastUpdated(now);
          return;
        }
        const nextRows = await fetchScenarioComparisonRows(nextDefinition);

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
    [companyId, periodOverride, scenarios.length, settings],
  );

  React.useEffect(() => {
    setSettingsReady(false);
    setSettings(
      loadSettings(storageKey, companyId, {
        userId: user?.id,
        viewId: preferenceScopeId,
      }),
    );
    setSettingsReady(true);
  }, [companyId, preferenceScopeId, storageKey, user?.id]);

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
    saveSettings(storageKey, companyId, settings, {
      userId: user?.id,
      viewId: preferenceScopeId,
    });
  }, [companyId, preferenceScopeId, settings, settingsReady, storageKey, user?.id]);

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

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  function updateSettings(next: Partial<ScenarioComparisonSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  return (
    <Card className={cn(monitorMode && "h-full shadow-none")}>
      <CardHeader className={cn("pb-3", monitorMode && "pb-2")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {resolvedTitle}
            </CardTitle>
            <CardDescription className="mt-1">
              {settingsOpen && !monitorMode ? description : configurationSummary}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated)}
              </Badge>
            ) : null}
            {monitorMode ? null : (
              <>
                {action}
                <Button
                  type="button"
                  variant={settingsOpen ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSettingsOpen((current) => !current)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {settingsOpen ? "Ocultar" : "Configurar"}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", monitorMode && "space-y-2")}>
        {!monitorMode && settingsOpen ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="space-y-3">
              <ScenarioComparisonConfigurator
                fixedPeriodLabel={periodOverride?.label}
                onChange={updateSettings}
                scenarios={scenarios}
                settings={settings}
              />
              <div className="flex justify-end lg:col-span-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSettingsOpen(false)}
                >
                  Concluir
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "w-full overflow-x-auto",
            monitorMode
              ? "h-[clamp(320px,42vh,620px)]"
              : "h-[360px]",
          )}
        >
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
            <EChart
              option={option}
              className={cn(
                definition.granularity === "day" && "min-w-[720px]",
              )}
            />
          ) : (
            <ChartState text="Sem eventos nos cenários selecionados para este período." />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ScenarioComparisonConfigurator({
  fixedPeriodLabel,
  onChange,
  scenarios,
  settings,
}: {
  fixedPeriodLabel?: string;
  onChange: (patch: Partial<ScenarioComparisonSettings>) => void;
  scenarios: Scenario[];
  settings: ScenarioComparisonSettings;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Visualização">
        <Select
          value={settings.view}
          onValueChange={(value) =>
            onChange({ view: value as ScenarioComparisonView })
          }
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {viewOptions.map((optionItem) => (
              <SelectItem key={optionItem.value} value={optionItem.value}>
                {optionItem.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Leitura">
        <Select
          value={settings.accumulated ? "accumulated" : "interval"}
          onValueChange={(value) =>
            onChange({ accumulated: value === "accumulated" })
          }
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="interval">Valor por intervalo</SelectItem>
            <SelectItem value="accumulated">Acumulado no período</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Granularidade">
        {settings.view === "period" ? (
        <Select
          value={settings.granularity}
          onValueChange={(value) =>
            onChange({ granularity: value as ScenarioCompareGranularity })
          }
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {granularityOptions.map((optionItem) => (
              <SelectItem key={optionItem.value} value={optionItem.value}>
                {optionItem.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        ) : (
          <div className="flex min-h-10 items-center rounded-md border bg-muted/20 px-3 text-sm text-foreground">
            Dia a dia
          </div>
        )}
      </Field>

      <Field label="Período">
        {fixedPeriodLabel ? (
          <div className="flex min-h-10 items-center rounded-md border bg-muted/20 px-3 text-sm text-foreground">
            {fixedPeriodLabel}
          </div>
        ) : (
          <Select
            value={settings.period}
            onValueChange={(value) =>
              onChange({ period: value as ScenarioComparePeriod })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {periodOptions.map((optionItem) => (
                <SelectItem key={optionItem.value} value={optionItem.value}>
                  {optionItem.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <ScenarioPicker
        className="sm:col-span-2"
        mode={settings.selectionMode}
        onModeChange={(selectionMode) => onChange({ selectionMode })}
        onSelectedIdsChange={(selectedScenarioIds) =>
          onChange({ selectedScenarioIds })
        }
        scenarios={scenarios}
        selectedIds={settings.selectedScenarioIds}
      />

      {!fixedPeriodLabel && settings.period === "custom" ? (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <Field label="De">
            <Input
              type="datetime-local"
              value={settings.customFrom}
              onChange={(event) => onChange({ customFrom: event.target.value })}
            />
          </Field>
          <Field label="Até">
            <Input
              type="datetime-local"
              value={settings.customTo}
              onChange={(event) => onChange({ customTo: event.target.value })}
            />
          </Field>
        </div>
      ) : (
        <div className="flex items-end sm:col-span-2">
          <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
            {fixedPeriodLabel ?? periodLabel(settings.period)} · {viewLabel(settings.view)} · {settings.accumulated ? "acumulado" : granularityLabel(settings.view === "period" ? settings.granularity : "day")}
          </div>
        </div>
      )}
    </div>
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

export async function fetchScenarioComparisonRows(
  definition: ScenarioComparisonDefinition,
) {
  const ranges = definition.baselineFrom && definition.baselineTo
    ? [
        {
          from: definition.baselineFrom,
          granularity: definition.granularity,
          to: definition.baselineTo,
        },
        {
          from: definition.currentFrom,
          granularity: definition.granularity,
          to: definition.currentTo,
        },
      ]
    : [
        {
          from: definition.currentFrom,
          granularity: definition.granularity,
          to: definition.currentTo,
        },
      ];
  const result = await Promise.all(
    ranges.map((range) => fetchScenarioComparisonRangeRows(range)),
  );

  return result.flat();
}

type AggregateRangeDefinition = {
  from: Date;
  granularity: AggregateGranularity;
  to: Date;
};

async function fetchScenarioComparisonRangeRows(
  definition: AggregateRangeDefinition,
) {
  const now = new Date();
  const useHourlySource = usesHourlyScenarioComparisonSource(definition);

  if (useHourlySource) {
    const hourlyDefinition = {
      granularity: "hour" as const,
      from: startOfHour(definition.from),
      to: alignEndToGranularity(definition.to, "hour"),
    };
    let hourlyRows = await fetchAggregateRows(hourlyDefinition);
    const currentHour = currentOpenBucket("hour", now);

    if (
      rangesOverlap(
        hourlyDefinition.from,
        hourlyDefinition.to,
        currentHour.from,
        currentHour.to,
      )
    ) {
      const minuteRows = await fetchAggregateRows(
        {
          granularity: "minute",
          from: currentHour.from,
          to: addMinutes(startOfMinute(now), 1),
        },
      );
      hourlyRows = replaceOpenBucketRowsFromSource(
        hourlyRows,
        "hour",
        currentHour.from,
        minuteRows,
        "minute",
        currentHour.from,
        currentHour.to,
      );
    }

    return hourlyRows;
  }

  return reconcileRecentScenarioComparisonBuckets(
    await fetchAggregateRows(definition),
    definition,
    now,
  );
}

async function reconcileRecentScenarioComparisonBuckets(
  targetRows: AggregateEventRow[],
  definition: AggregateRangeDefinition,
  now: Date,
) {
  if (
    definition.granularity !== "day" &&
    definition.granularity !== "week" &&
    definition.granularity !== "month"
  ) {
    return targetRows;
  }

  const recentDays = scenarioComparisonRecentDayStarts(now);
  const affectedBucketStarts = uniqueScenarioComparisonDates(
    recentDays
      .map((dayStart) =>
        alignToGranularity(dayStart, definition.granularity),
      )
      .filter((bucketStart) =>
        rangesOverlap(
          definition.from,
          definition.to,
          bucketStart,
          addGranularity(bucketStart, definition.granularity),
        ),
      ),
  );
  if (!affectedBucketStarts.length) return targetRows;

  const dailySourceFrom = affectedBucketStarts[0];
  const dailySourceTo = affectedBucketStarts.reduce((latest, bucketStart) => {
    const bucketEnd = addGranularity(bucketStart, definition.granularity);
    return bucketEnd > latest ? bucketEnd : latest;
  }, addGranularity(affectedBucketStarts[0], definition.granularity));
  let dailyRows =
    definition.granularity === "day"
      ? targetRows
      : await fetchAggregateRows(
          {
            granularity: "day",
            from: dailySourceFrom,
            to: dailySourceTo,
          },
        );
  const recentFrom = recentDays[0];
  const recentTo = addHours(startOfHour(now), 1);
  const hourlyFrom = new Date(
    Math.max(dailySourceFrom.getTime(), recentFrom.getTime()),
  );
  const hourlyTo = new Date(
    Math.min(dailySourceTo.getTime(), recentTo.getTime()),
  );
  if (hourlyTo <= hourlyFrom) return targetRows;

  let hourlyRows = await fetchAggregateRows({
    granularity: "hour",
    from: hourlyFrom,
    to: hourlyTo,
  });
  const currentHour = currentOpenBucket("hour", now);
  if (rangesOverlap(hourlyFrom, hourlyTo, currentHour.from, currentHour.to)) {
    const minuteRows = await fetchAggregateRows(
      {
        granularity: "minute",
        from: currentHour.from,
        to: addMinutes(startOfMinute(now), 1),
      },
    );
    hourlyRows = replaceOpenBucketRowsFromSource(
      hourlyRows,
      "hour",
      currentHour.from,
      minuteRows,
      "minute",
      currentHour.from,
      currentHour.to,
    );
  }

  recentDays.forEach((dayStart) => {
    const dayEnd = addDays(dayStart, 1);
    if (!rangesOverlap(dailySourceFrom, dailySourceTo, dayStart, dayEnd)) return;
    dailyRows = replaceOpenBucketRowsFromSource(
      dailyRows,
      "day",
      dayStart,
      hourlyRows,
      "hour",
      dayStart,
      dayEnd,
    );
  });

  if (definition.granularity === "day") return dailyRows;

  let reconciledRows = targetRows;
  affectedBucketStarts.forEach((bucketStart) => {
    const bucketEnd = addGranularity(bucketStart, definition.granularity);
    reconciledRows = replaceOpenBucketRowsFromSource(
      reconciledRows,
      definition.granularity,
      bucketStart,
      dailyRows,
      "day",
      bucketStart,
      bucketEnd,
    );
  });
  return reconciledRows;
}

function scenarioComparisonRecentDayStarts(now: Date) {
  const firstDay = addDays(
    startOfDay(now),
    1 - RECENT_DAY_RECONCILIATION_COUNT,
  );
  return Array.from(
    { length: RECENT_DAY_RECONCILIATION_COUNT },
    (_, index) => addDays(firstDay, index),
  );
}

function uniqueScenarioComparisonDates(dates: Date[]) {
  return Array.from(
    new Map(dates.map((date) => [date.getTime(), date] as const)).values(),
  ).sort((left, right) => left.getTime() - right.getTime());
}

async function fetchAggregateRows(
  definition: AggregateRangeDefinition,
) {
  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: aggregateQueryIso(definition.from, definition.granularity),
    metric_type: DEFAULT_METRIC_TYPE,
    to: aggregateQueryIso(definition.to, definition.granularity),
  });
  const response = await apiFetch<AggregateEventsResponse>(
    `/analytics/aggregate?${params.toString()}`,
  );

  return response.data ?? [];
}

function usesHourlyScenarioComparisonSource(
  definition: Pick<AggregateRangeDefinition, "from" | "to">,
) {
  const rangeDuration = definition.to.getTime() - definition.from.getTime();
  return rangeDuration > 0 && rangeDuration <= 32 * 24 * HOUR_MS;
}

function scenarioComparisonSourceGranularity(
  definition: AggregateRangeDefinition,
): AggregateGranularity {
  return usesHourlyScenarioComparisonSource(definition)
    ? "hour"
    : definition.granularity;
}

export function buildScenarioComparisonDefinition(
  settings: ScenarioComparisonSettings,
  now: Date,
  periodOverride?: ScenarioComparisonPeriodOverride,
): ScenarioComparisonDefinition {
  const range = periodOverride ?? scenarioComparisonRange(settings, now);
  if (settings.view !== "period") {
    const rangeEndReference = new Date(
      Math.max(range.from.getTime(), range.to.getTime() - 1),
    );
    const currentFrom = startOfMonth(rangeEndReference);
    const currentMonthEnd = addMonths(currentFrom, 1);
    const requestedCurrentTo = range.to < currentMonthEnd
      ? range.to
      : currentMonthEnd;
    const currentTo = new Date(
      Math.min(
        currentMonthEnd.getTime(),
        alignEndToGranularity(requestedCurrentTo, "day").getTime(),
      ),
    );
    const baselineFrom = settings.view === "days_year"
      ? new Date(currentFrom.getFullYear() - 1, currentFrom.getMonth(), 1)
      : addMonths(currentFrom, -1);
    const comparableDays = Math.max(
      1,
      calendarDayDistance(currentFrom, currentTo),
    );
    const baselineMonthEnd = addMonths(baselineFrom, 1);
    const baselineTo = new Date(
      Math.min(
        baselineMonthEnd.getTime(),
        addDays(baselineFrom, comparableDays).getTime(),
      ),
    );

    return {
      accumulated: settings.accumulated,
      baselineFrom,
      baselineLabel: monthYearLabel(baselineFrom),
      baselineTo,
      currentFrom,
      currentLabel: monthYearLabel(currentFrom),
      currentTo,
      from: baselineFrom,
      granularity: "day",
      to: currentTo,
      view: settings.view,
    };
  }

  const granularity = periodOverride
    ? fitScenarioGranularityToRange(
        settings.granularity,
        range.from,
        range.to,
      )
    : settings.granularity;

  return {
    accumulated: settings.accumulated,
    currentFrom: alignToGranularity(range.from, granularity),
    currentTo: alignEndToGranularity(range.to, granularity),
    granularity,
    from: alignToGranularity(range.from, granularity),
    to: alignEndToGranularity(range.to, granularity),
    view: settings.view,
  };
}

function fitScenarioGranularityToRange(
  preferred: ScenarioCompareGranularity,
  from: Date,
  to: Date,
) {
  const order: ScenarioCompareGranularity[] = ["hour", "day", "week", "month"];
  let index = Math.max(0, order.indexOf(preferred));

  while (index < order.length - 1 && estimatedBucketCount(from, to, order[index]) > 240) {
    index += 1;
  }

  return order[index];
}

function estimatedBucketCount(
  from: Date,
  to: Date,
  granularity: ScenarioCompareGranularity,
) {
  const duration = Math.max(0, to.getTime() - from.getTime());
  if (granularity === "hour") return Math.ceil(duration / HOUR_MS);
  if (granularity === "day") return Math.ceil(duration / (24 * HOUR_MS));
  if (granularity === "week") return Math.ceil(duration / (7 * 24 * HOUR_MS));
  return Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 +
      to.getMonth() -
      from.getMonth(),
  );
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

export function selectScenarioComparisonScenarios(
  scenarios: Scenario[],
  settings: ScenarioComparisonSettings,
) {
  if (settings.selectionMode === "all") {
    return scenarios;
  }

  const selectedIds = new Set(settings.selectedScenarioIds);
  return scenarios.filter((scenario) => selectedIds.has(scenario.id));
}

export function buildScenarioComparisonPoints(
  scenario: Scenario,
  rows: AggregateEventRow[],
  definition: ScenarioComparisonDefinition,
): ChartPoint[] {
  const sourceGranularity = scenarioComparisonSourceGranularity({
    from: definition.currentFrom,
    granularity: definition.granularity,
    to: definition.currentTo,
  });
  const points = listBucketStarts(definition).map((bucketStart) => {
    const next = addGranularity(bucketStart, definition.granularity);

    return {
      id: bucketStart.toISOString(),
      isSaturday:
        definition.granularity === "day" && bucketStart.getDay() === 6,
      isSunday:
        definition.granularity === "day" && bucketStart.getDay() === 0,
      name: bucketLabel(bucketStart, definition.granularity),
      total: sumScenarioRowsInRange(
        rows,
        scenario,
        bucketStart,
        next,
        sourceGranularity,
      ),
    };
  });

  return definition.accumulated ? accumulateChartPoints(points) : points;
}

export function buildScenarioComparisonSeries(
  scenarios: Scenario[],
  rows: AggregateEventRow[],
  definition: ScenarioComparisonDefinition,
): ScenarioComparisonSeries[] {
  if (
    definition.view === "period" ||
    !definition.baselineFrom ||
    !definition.baselineTo
  ) {
    return scenarios.map((scenario, index) => ({
      colorIndex: index,
      id: scenario.id,
      name: scenario.name,
      points: buildScenarioComparisonPoints(scenario, rows, definition),
    }));
  }

  const currentDays = calendarDayDistance(
    definition.currentFrom,
    definition.currentTo,
  );
  const baselineDays = calendarDayDistance(
    definition.baselineFrom,
    definition.baselineTo,
  );
  const dayCount = DAY_OF_MONTH_AXIS_LABELS.length;
  const baselineSourceGranularity = scenarioComparisonSourceGranularity({
    from: definition.baselineFrom,
    granularity: definition.granularity,
    to: definition.baselineTo,
  });
  const currentSourceGranularity = scenarioComparisonSourceGranularity({
    from: definition.currentFrom,
    granularity: definition.granularity,
    to: definition.currentTo,
  });

  return scenarios.flatMap((scenario, index) => {
    const baselinePoints = buildDailyScenarioPoints(
      scenario,
      rows,
      definition.baselineFrom!,
      baselineDays,
      dayCount,
      baselineSourceGranularity,
    );
    const currentPoints = buildDailyScenarioPoints(
      scenario,
      rows,
      definition.currentFrom,
      currentDays,
      dayCount,
      currentSourceGranularity,
    );

    return [
      {
        colorIndex: index,
        id: `${scenario.id}:baseline`,
        name: `${scenario.name} · ${definition.baselineLabel ?? "Base"}`,
        points: definition.accumulated
          ? accumulateChartPoints(baselinePoints)
          : baselinePoints,
        temporalRole: "baseline" as const,
      },
      {
        colorIndex: index,
        id: `${scenario.id}:current`,
        name: `${scenario.name} · ${definition.currentLabel ?? "Atual"}`,
        points: definition.accumulated
          ? accumulateChartPoints(currentPoints)
          : currentPoints,
        temporalRole: "current" as const,
      },
    ];
  });
}

function buildDailyScenarioPoints(
  scenario: Scenario,
  rows: AggregateEventRow[],
  monthStart: Date,
  availableDays: number,
  dayCount: number,
  sourceGranularity: AggregateGranularity,
): ChartPoint[] {
  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  ).getDate();

  return Array.from({ length: dayCount }, (_, index) => {
    const from = addDays(monthStart, index);
    const existsInMonth = index < daysInMonth;

    return {
      id: from.toISOString(),
      isSaturday: existsInMonth && from.getDay() === 6,
      isSunday: existsInMonth && from.getDay() === 0,
      name: String(index + 1),
      total:
        existsInMonth && index < availableDays
          ? sumScenarioRowsInRange(
              rows,
              scenario,
              from,
              addDays(from, 1),
              sourceGranularity,
            )
          : null,
    };
  });
}

function accumulateChartPoints(points: ChartPoint[]) {
  let accumulated = 0;

  return points.map((point) => {
    if (point.total === null) return point;
    accumulated += point.total;
    return { ...point, total: accumulated };
  });
}

export function buildScenarioComparisonChartOption(
  series: ScenarioComparisonSeries[],
  granularity: AggregateGranularity,
  widgetColor?: string,
): EnterpriseChartOption {
  const fixedHourlyAxis =
    granularity === "hour" &&
    series.length > 0 &&
    series.every((item) => pointsShareOneCalendarDay(item.points));
  const hourlyThrough = fixedHourlyAxis
    ? latestHourlyPointHour(
        series.flatMap((item) =>
          item.points.flatMap((point) =>
            point.total === null
              ? []
              : [{ bucket: point.id, total: point.total }],
          ),
        ),
      )
    : -1;
  const bucketLabels = fixedHourlyAxis
    ? HOUR_OF_DAY_LABELS
    : series[0]?.points.map((point) => point.name) ?? [];
  const dense = bucketLabels.length > 12;
  const manySeries = series.length > 12;
  const veryManySeries = series.length > 24;
  const calendarPoints =
    series.find((item) => item.temporalRole === "current")?.points ??
    series[0]?.points ??
    [];
  const saturdayIndexes = new Set(
    granularity === "day"
      ? calendarPoints.flatMap((point, index) =>
          point.isSaturday ? [index] : [],
        )
      : [],
  );
  const sundayIndexes = new Set(
    granularity === "day"
      ? calendarPoints.flatMap((point, index) =>
          point.isSunday ? [index] : [],
        )
      : [],
  );
  const calendarDates =
    granularity === "day" ? calendarPoints.map((point) => point.id) : [];

  return {
    color: series.map((item) =>
      item.colorIndex === 0 && widgetColor
        ? widgetColor
        : pastelBarColor(item.colorIndex),
    ),
    grid: {
      bottom: dense ? 34 : 18,
      containLabel: true,
      left: 42,
      right: 18,
      top: series.length > 1 ? (manySeries ? 76 : 58) : 28,
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
      axisLabel: buildCalendarAxisLabel({
        fontSize: 11,
        hideOverlap: true,
        holidayIndexes: holidayCategoryIndexes(calendarDates),
        interval: 0,
        rotate: dense ? 24 : 0,
        saturdayIndexes,
        sundayIndexes,
      }),
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
    series: series.map((item, seriesIndex) => {
      const color =
        item.colorIndex === 0 && widgetColor
          ? widgetColor
          : pastelBarColor(item.colorIndex);

      return {
        barCategoryGap:
          manySeries ? "18%" : series.length > 4 ? "28%" : "38%",
        barGap: veryManySeries ? "2%" : manySeries ? "4%" : "8%",
        barMaxWidth:
          veryManySeries
            ? 10
            : manySeries
              ? 14
              : granularity === "hour"
                ? 18
                : 28,
        data: fixedHourlyAxis
          ? buildFixedHourlyAxisValues(
              item.points.flatMap((point) =>
                point.total === null
                  ? []
                  : [{ bucket: point.id, total: point.total }],
              ),
              hourlyThrough,
            )
          : item.points.map((point) => point.total),
        emphasis: {
          focus: "series",
          itemStyle: {
            color,
            opacity: 1,
          },
        },
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color,
          opacity: item.temporalRole === "baseline" ? 0.42 : 0.96,
        },
        markArea:
          seriesIndex === 0 && granularity === "day"
            ? buildCalendarMarkArea(calendarDates)
            : undefined,
        name: item.name,
        type: "bar",
      };
    }),
  };
}

function pointsShareOneCalendarDay(points: readonly ChartPoint[]) {
  if (!points.length) return false;

  const days = new Set<string>();
  for (const point of points) {
    const date = new Date(point.id);
    if (Number.isNaN(date.getTime())) return false;
    days.add(
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    );
    if (days.size > 1) return false;
  }

  return days.size === 1;
}

export function buildScenarioComparisonReportChart({
  definition,
  rows,
  scenarios,
  settings,
  periodLabelOverride,
  title = "Cenários por período",
  widgetColor,
}: {
  definition: ScenarioComparisonDefinition;
  rows: AggregateEventRow[];
  scenarios: Scenario[];
  settings: ScenarioComparisonSettings;
  periodLabelOverride?: string;
  title?: string;
  widgetColor?: string;
}): ReportPayload["charts"][number] {
  const selectedScenarios = selectScenarioComparisonScenarios(scenarios, settings);
  const series = buildScenarioComparisonSeries(
    selectedScenarios,
    rows,
    definition,
  );
  const buckets =
    series[0]?.points ??
    emptyScenarioComparisonBuckets(definition);

  return {
    comparison: `${formatReportDateTime(definition.from)} até ${formatReportDateTime(
      definition.to,
    )}`,
    description: [
      `Período: ${periodLabelOverride ?? periodLabel(settings.period)}`,
      viewLabel(settings.view),
      `${settings.accumulated ? "Acumulado" : granularityLabel(definition.granularity)}${
        definition.granularity === settings.granularity ? "" : " (ajustada)"
      }`,
      ...(definition.granularity === "day"
        ? ["Fins de semana destacados no eixo"]
        : []),
      scenarioSelectionLabel(settings, selectedScenarios),
    ].join(" · "),
    option: buildScenarioComparisonChartOption(
      series,
      definition.granularity,
      widgetColor,
    ),
    table: {
      title: `Dados - ${title}`,
      columns: [
        { key: "period", label: "Período", width: 20 },
        ...(definition.view === "period"
          ? [{ key: "period_start", label: "Início do período", width: 22 }]
          : []),
        ...series.map((item) => ({
          key: scenarioColumnKey(item.id),
          label: item.name,
          numeric: true,
          width: 18,
        })),
      ],
      rows: buckets.map((bucket, index) => {
        const row: Record<string, string | number> = {
          period: bucket.name,
          ...(definition.view === "period"
            ? { period_start: formatReportDateTime(new Date(bucket.id)) }
            : {}),
        };

        for (const item of series) {
          row[scenarioColumnKey(item.id)] = item.points[index]?.total ?? 0;
        }

        return row;
      }),
    },
    title,
  };
}

function emptyScenarioComparisonBuckets(
  definition: ScenarioComparisonDefinition,
): ChartPoint[] {
  if (definition.view !== "period" && definition.baselineFrom && definition.baselineTo) {
    const dayCount = DAY_OF_MONTH_AXIS_LABELS.length;
    const daysInMonth = new Date(
      definition.currentFrom.getFullYear(),
      definition.currentFrom.getMonth() + 1,
      0,
    ).getDate();
    return Array.from({ length: dayCount }, (_, index) => ({
      id: addDays(definition.currentFrom, index).toISOString(),
      isSaturday:
        index < daysInMonth &&
        addDays(definition.currentFrom, index).getDay() === 6,
      isSunday:
        index < daysInMonth &&
        addDays(definition.currentFrom, index).getDay() === 0,
      name: String(index + 1),
      total: 0,
    }));
  }

  return listBucketStarts(definition).map((bucketStart) => ({
    id: bucketStart.toISOString(),
    isSaturday:
      definition.granularity === "day" && bucketStart.getDay() === 6,
    isSunday:
      definition.granularity === "day" && bucketStart.getDay() === 0,
    name: bucketLabel(bucketStart, definition.granularity),
    total: 0,
  }));
}

function sumScenarioRowsInRange(
  rows: AggregateEventRow[],
  scenario: Scenario,
  from: Date,
  to: Date,
  sourceGranularity: AggregateGranularity,
) {
  const multipliers = scenarioMultiplierMap(scenario);

  return rows.reduce((sum, row) => {
    const multiplier = row.line_count_id
      ? multipliers.get(row.line_count_id)
      : undefined;
    if (multiplier === undefined) return sum;

    if (!aggregateBucketInRange(row.bucket, sourceGranularity, from, to)) {
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
  sourceGranularity: AggregateGranularity,
  sourceFrom: Date,
  sourceTo: Date,
) {
  const targetKey = bucketKeyForGranularity(bucketStart, targetGranularity);
  const replacementRows = aggregateRowsIntoBucket(
    sourceRows,
    sourceGranularity,
    sourceFrom,
    sourceTo,
  ).map((row) => ({
    ...row,
    bucket: bucketStart.toISOString(),
  }));

  return [
    ...rows.filter((row) => {
      const rowDate = parseAggregateBucket(row.bucket, targetGranularity);
      if (!rowDate) return true;
      return bucketKeyForGranularity(rowDate, targetGranularity) !== targetKey;
    }),
    ...replacementRows,
  ];
}

function aggregateRowsIntoBucket(
  rows: AggregateEventRow[],
  sourceGranularity: AggregateGranularity,
  from: Date,
  to: Date,
) {
  const totals = new Map<string, AggregateIdentityTotal>();

  rows.forEach((row) => {
    if (!aggregateBucketInRange(row.bucket, sourceGranularity, from, to)) return;

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

function listBucketStarts(definition: ScenarioComparisonDefinition) {
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

function calendarDayDistance(from: Date, to: Date) {
  const fromUtc = Date.UTC(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  );
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((toUtc - fromUtc) / (24 * HOUR_MS)));
}

function monthYearLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(".", "");
}

function parseLocalDateTime(value: string) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createDefaultScenarioComparisonSettings(): ScenarioComparisonSettings {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return {
    accumulated: false,
    customFrom: toDateTimeLocalValue(start),
    customTo: toDateTimeLocalValue(new Date()),
    granularity: "hour",
    period: "today",
    selectedScenarioIds: [],
    selectionMode: "all",
    view: "period",
  };
}

export function loadScenarioComparisonSettings(
  storageKey: string,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  return loadSettings(storageKey, companyId, scope);
}

export function saveScenarioComparisonSettings(
  storageKey: string,
  settings: ScenarioComparisonSettings,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  saveSettings(
    storageKey,
    companyId,
    normalizeScenarioComparisonSettings(settings),
    scope,
  );
}

export function deleteScenarioComparisonSettings(
  storageKey: string,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(
    settingsStorageKey(storageKey, companyId, scope),
  );
}

function loadSettings(
  storageKey: string,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return createDefaultScenarioComparisonSettings();

  try {
    const stored = window.localStorage.getItem(
      settingsStorageKey(storageKey, companyId, scope),
    );
    if (!stored) return createDefaultScenarioComparisonSettings();

    const parsed = JSON.parse(stored) as Partial<ScenarioComparisonSettings>;
    return normalizeScenarioComparisonSettings(parsed);
  } catch {
    return createDefaultScenarioComparisonSettings();
  }
}

function saveSettings(
  storageKey: string,
  companyId: string | null | undefined,
  settings: ScenarioComparisonSettings,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    settingsStorageKey(storageKey, companyId, scope),
    JSON.stringify(settings),
  );
}

function settingsStorageKey(
  storageKey: string,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  return getUserViewScopedStorageKey(
    `ipxdata.${storageKey}.scenario-comparison.v1`,
    companyId,
    scope.userId,
    scope.viewId,
  );
}

export function normalizeScenarioComparisonSettings(
  value: unknown,
): ScenarioComparisonSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<ScenarioComparisonSettings>)
      : {};
  const fallback = createDefaultScenarioComparisonSettings();

  return {
    accumulated:
      typeof settings.accumulated === "boolean"
        ? settings.accumulated
        : fallback.accumulated,
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
    view: isScenarioComparisonView(settings.view)
      ? settings.view
      : fallback.view,
  };
}

function isScenarioComparisonView(
  value: unknown,
): value is ScenarioComparisonView {
  return value === "period" || value === "days_month" || value === "days_year";
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

function granularityLabel(value: AggregateGranularity) {
  return (
    granularityOptions.find((option) => option.value === value)?.label ??
    "Hora a hora"
  );
}

function viewLabel(value: ScenarioComparisonView) {
  return (
    viewOptions.find((option) => option.value === value)?.label ??
    "Período configurado"
  );
}

function scenarioColumnKey(scenarioId: string) {
  return `scenario_${scenarioId}`;
}

function formatReportDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function scenarioSelectionLabel(
  settings: ScenarioComparisonSettings,
  scenarios: Scenario[],
) {
  if (settings.selectionMode === "all") return "Todos os cenários";
  if (!scenarios.length) return "Nenhum cenário selecionado";
  if (scenarios.length === 1) return scenarios[0]?.name ?? "1 cenário";

  return `${formatNumber(scenarios.length)} cenários`;
}
