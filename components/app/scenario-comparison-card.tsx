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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  endOfAggregateBucket,
  requireAggregateGranularity,
  requireAggregateRowsInRange,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  clearHourlyAggregateCache,
  fetchHourlyAggregateRanges,
  type HourlyAggregateCache,
} from "@/lib/aggregate-hour-query";
import { reconcileAggregateRows } from "@/lib/aggregate-reconciliation";
import {
  DAY_OF_MONTH_AXIS_LABELS,
  buildCalendarAxisLabel,
  buildCalendarMarkArea,
  holidayCategoryIndexes,
} from "@/lib/chart-calendar-axis";
import { pastelBarColor } from "@/lib/chart-palette";
import { requireCountingRuntimeTimeZone } from "@/lib/counting-time-zone";
import {
  requireScenarioComparisonScope,
  type ScenarioComparisonSourceScope,
} from "@/lib/scenario-comparison-scope";
import {
  buildFixedHourlyAxisValues,
  HOUR_OF_DAY_LABELS,
  resolveFixedHourlyDayWindow,
} from "@/lib/hourly-axis";
import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import {
  getUserViewScopedStorageKey,
  readUserViewScopedStorageEntry,
} from "@/lib/master-company-scope";
import type { ReportPayload } from "@/lib/report-export";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  Scenario,
} from "@/lib/types";
import {
  removeUserGridPreference,
  writeUserGridPreference,
} from "@/lib/user-grid-local";
import { cn, formatNumber, formatTime, toDateTimeLocalValue } from "@/lib/utils";

type ScenarioComparisonCardProps = {
  action?: React.ReactNode;
  autoRefresh?: boolean;
  companyId?: string | null;
  companyTimeZone: string;
  description?: string;
  disabledReason?: string;
  hourlySource?: ScenarioComparisonHourlySource;
  monitorMode?: boolean;
  periodOverride?: ScenarioComparisonPeriodOverride;
  preferenceScopeId?: string | null;
  scenarios: Scenario[];
  storageKey: string;
  title?: string;
};

export type ScenarioComparisonHourlySource = ScenarioComparisonSourceScope & {
  from: Date;
  rows: AggregateEventRow[];
  to: Date;
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

const DEFAULT_METRIC_TYPE = "count";
const REFRESH_MS = 5_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

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
  companyTimeZone,
  description = "Compare os cenários escolhidos no mesmo gráfico.",
  disabledReason,
  hourlySource,
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
  const requestSequenceRef = React.useRef(0);
  const requestRunningRef = React.useRef(false);
  const requestRef = React.useRef<AbortController | null>(null);
  const hourlyAggregateCacheRef = React.useRef<HourlyAggregateCache>(
    new Map(),
  );
  const scopeCertificationError = React.useMemo(() => {
    try {
      requireScenarioComparisonScope({
        companyScopeId: companyId,
        companyTimeZone,
        hourlySource,
        scenarios,
      });
      return "";
    } catch (scopeError) {
      return scopeError instanceof Error
        ? scopeError.message
        : "Escopo da comparação não certificado.";
    }
  }, [companyId, companyTimeZone, hourlySource, scenarios]);
  const effectiveDisabledReason = disabledReason || scopeCertificationError;
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
  const hasData =
    (definition.granularity === "hour" &&
      series.some((item) => item.points.length > 0)) ||
    series.some((item) =>
      item.points.some((point) => point.total !== null && point.total !== 0),
    );
  const option = React.useMemo(
    () =>
      buildScenarioComparisonChartOption(
        series,
        definition,
        widgetColor,
        lastUpdated ?? new Date(),
      ),
    [definition, lastUpdated, series, widgetColor],
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
      const requestSequence = ++requestSequenceRef.current;
      requestRef.current?.abort();
      requestRef.current = null;
      requestRunningRef.current = true;
      if (effectiveDisabledReason) {
        setRows([]);
        setError(effectiveDisabledReason);
        setLastUpdated(null);
        setLoading(false);
        setDefinition(
          buildScenarioComparisonDefinition(settings, new Date(), periodOverride),
        );
        requestRunningRef.current = false;
        return;
      }

      if (!companyId) {
        setRows([]);
        setError("Empresa não definida para esta comparação.");
        setLastUpdated(null);
        setLoading(false);
        requestRunningRef.current = false;
        return;
      }

      try {
        requireCountingRuntimeTimeZone(companyTimeZone);
      } catch (loadError) {
        setRows([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Fuso da empresa não disponível.",
        );
        setLastUpdated(null);
        setLoading(false);
        requestRunningRef.current = false;
        return;
      }

      if (!scenarios.length) {
        setRows([]);
        setError("");
        setLastUpdated(null);
        setLoading(false);
        setDefinition(
          buildScenarioComparisonDefinition(settings, new Date(), periodOverride),
        );
        requestRunningRef.current = false;
        return;
      }

      if (settings.selectionMode === "custom" && !settings.selectedScenarioIds.length) {
        setRows([]);
        setError("");
        setLastUpdated(null);
        setLoading(false);
        setDefinition(
          buildScenarioComparisonDefinition(settings, new Date(), periodOverride),
        );
        requestRunningRef.current = false;
        return;
      }

      if (!silent) setLoading(true);
      setError("");
      const controller = new AbortController();
      requestRef.current = controller;

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
          setLastUpdated(null);
          return;
        }
        const nextRows = await fetchScenarioComparisonRows(
          nextDefinition,
          hourlySource,
          companyTimeZone,
          companyId,
          {
            cache: hourlyAggregateCacheRef.current,
            cacheScope: `scenario-comparison:${companyId}`,
            now,
            signal: controller.signal,
          },
        );
        if (requestSequence !== requestSequenceRef.current) return;

        setDefinition(nextDefinition);
        setRows(nextRows);
        setLastUpdated(now);
      } catch (loadError) {
        if (requestSequence !== requestSequenceRef.current) return;
        if (loadError instanceof Error && loadError.name === "AbortError") {
          return;
        }
        setRows([]);
        setLastUpdated(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar a comparação de cenários.",
        );
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setLoading(false);
          requestRunningRef.current = false;
          if (requestRef.current === controller) requestRef.current = null;
        }
      }
    },
    [
      companyId,
      companyTimeZone,
      effectiveDisabledReason,
      hourlySource,
      periodOverride,
      scenarios,
      settings,
    ],
  );

  React.useEffect(() => {
    requestSequenceRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    requestRunningRef.current = false;
    clearHourlyAggregateCache(hourlyAggregateCacheRef.current);
    setRows([]);
    setError("");
    setLastUpdated(null);
    setSettingsReady(false);
    setSettings(
      loadSettings(storageKey, companyId, {
        userId: user?.id,
        viewId: preferenceScopeId,
      }),
    );
    setSettingsReady(true);
  }, [companyId, companyTimeZone, preferenceScopeId, storageKey, user?.id]);

  React.useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      requestRef.current?.abort();
    },
    [],
  );

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
      if (
        document.visibilityState === "visible" &&
        !requestRunningRef.current
      ) {
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
    <Card
      className={cn(
        "@container min-w-0 overflow-hidden",
        monitorMode && "h-full shadow-none",
      )}
    >
      <CardHeader className={cn("pb-3", monitorMode && "pb-2")}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2 [overflow-wrap:anywhere]">
              <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
              {resolvedTitle}
            </CardTitle>
            <CardDescription className="mt-1 [overflow-wrap:anywhere]">
              {configurationSummary}
            </CardDescription>
          </div>
          {!monitorMode ? action : null}
          <div className="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2">
            {lastUpdated ? (
              <Badge variant="outline" className="gap-1 bg-card">
                <Clock3 className="h-3.5 w-3.5" />
                {formatTime(lastUpdated)}
              </Badge>
            ) : null}
            {monitorMode ? null : (
              <Button
                type="button"
                variant={settingsOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configurar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        className={cn("min-h-0 flex-1 overflow-hidden", monitorMode && "pt-2")}
        data-echart-layout="natural"
      >
        <div
          aria-label="Gráfico comparativo responsivo"
          className={cn(
            "h-[360px] min-h-0 w-full flex-1 overflow-hidden",
            monitorMode
              ? "h-[clamp(320px,42vh,620px)]"
              : "h-[360px]",
          )}
          role="region"
        >
          {loading && !rows.length ? (
            <Skeleton className="h-full w-full" />
          ) : effectiveDisabledReason || error ? (
            <ChartState text={effectiveDisabledReason || error} />
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
      <Dialog open={settingsOpen && !monitorMode} onOpenChange={setSettingsOpen}>
        <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Configurar comparação por cenário</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            <ScenarioComparisonConfigurator
              fixedPeriodLabel={periodOverride?.label}
              onChange={updateSettings}
              scenarios={scenarios}
              settings={settings}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setSettingsOpen(false)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          <SelectTrigger aria-label="Visualização"><SelectValue /></SelectTrigger>
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
          <SelectTrigger aria-label="Leitura"><SelectValue /></SelectTrigger>
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
          <SelectTrigger aria-label="Granularidade"><SelectValue /></SelectTrigger>
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
            <SelectTrigger aria-label="Período"><SelectValue /></SelectTrigger>
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
              aria-label="De"
              type="datetime-local"
              value={settings.customFrom}
              onChange={(event) => onChange({ customFrom: event.target.value })}
            />
          </Field>
          <Field label="Até">
            <Input
              aria-label="Até"
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
      <div className="text-sm font-medium leading-none">{label}</div>
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
  hourlySource: ScenarioComparisonHourlySource | undefined,
  companyTimeZone: string,
  companyScopeId: string,
  options: ScenarioComparisonFetchOptions = {},
) {
  const certifiedScope = requireScenarioComparisonScope({
    companyScopeId,
    companyTimeZone,
    hourlySource,
  });
  requireCountingRuntimeTimeZone(certifiedScope.companyTimeZone);
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
    ranges.map((range) =>
      fetchScenarioComparisonRangeRows(
        range,
        certifiedScope.companyScopeId,
        hourlySource,
        options,
      ),
    ),
  );

  return result.flat();
}

type AggregateRangeDefinition = {
  from: Date;
  granularity: AggregateGranularity;
  to: Date;
};

type ScenarioComparisonFetchOptions = {
  cache?: HourlyAggregateCache;
  cacheScope?: string;
  now?: Date;
  signal?: AbortSignal;
};

async function fetchScenarioComparisonRangeRows(
  definition: AggregateRangeDefinition,
  companyScopeId: string,
  hourlySource?: ScenarioComparisonHourlySource,
  options: ScenarioComparisonFetchOptions = {},
) {
  const now = options.now ?? new Date();
  const hourlyDefinition = {
    granularity: "hour" as const,
    from: startOfHour(definition.from),
    to: alignEndToGranularity(definition.to, "hour"),
  };
  const sourceIntersectionFrom = hourlySource
    ? new Date(
        Math.max(
          hourlyDefinition.from.getTime(),
          hourlySource.from.getTime(),
        ),
      )
    : null;
  const sourceIntersectionTo = hourlySource
    ? new Date(
        Math.min(
          hourlyDefinition.to.getTime(),
          hourlySource.to.getTime(),
        ),
      )
    : null;
  const hasSourceIntersection = Boolean(
    sourceIntersectionFrom &&
      sourceIntersectionTo &&
      sourceIntersectionFrom < sourceIntersectionTo,
  );
  const hasProvidedSource = Boolean(
    hourlySource &&
      hourlySource.from <= hourlyDefinition.from &&
      hourlySource.to >= hourlyDefinition.to,
  );
  let hourlyRows = hasProvidedSource && hourlySource
    ? hourlySource.rows.filter((row) =>
        aggregateBucketInRange(
          row.bucket,
          "hour",
          hourlyDefinition.from,
          hourlyDefinition.to,
        ),
      )
    : await fetchAggregateRows(hourlyDefinition, companyScopeId, options);
  const currentHour = currentOpenBucket("hour", now);
  const currentMinuteEnd = addMinutes(startOfMinute(now), 1);
  const requiredCurrentFrom = new Date(
    Math.max(hourlyDefinition.from.getTime(), currentHour.from.getTime()),
  );
  const requiredCurrentTo = new Date(
    Math.min(
      hourlyDefinition.to.getTime(),
      definition.to.getTime(),
      currentMinuteEnd.getTime(),
    ),
  );
  const canonicalCoversCurrentRange = Boolean(
    hourlySource &&
      requiredCurrentFrom < requiredCurrentTo &&
      hourlySource.from <= requiredCurrentFrom &&
      hourlySource.to >= requiredCurrentTo,
  );
  let reconciledCurrentCutoff = false;
  let currentOpenMinuteRows: AggregateEventRow[] | undefined;

  if (
    !hasProvidedSource &&
    !canonicalCoversCurrentRange &&
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
        to: currentMinuteEnd,
      },
      companyScopeId,
      options,
    );
    currentOpenMinuteRows = minuteRows;
    hourlyRows = replaceOpenBucketRowsFromSource(
      hourlyRows,
      "hour",
      currentHour.from,
      minuteRows,
      "minute",
      currentHour.from,
      currentHour.to,
    );
    reconciledCurrentCutoff = true;
  }

  if (
    hasSourceIntersection &&
    hourlySource &&
    sourceIntersectionFrom &&
    sourceIntersectionTo
  ) {
    hourlyRows = reconcileAggregateRows(
      hourlyRows,
      "hour",
      hourlySource.rows,
      "hour",
      sourceIntersectionFrom,
      sourceIntersectionTo,
    );
  }

  const initialBoundaryStart = startOfHour(definition.from);
  const initialBoundaryTo = new Date(
    Math.min(
      endOfAggregateBucket(initialBoundaryStart, "hour").getTime(),
      definition.to.getTime(),
      currentMinuteEnd.getTime(),
    ),
  );
  const hasPartialInitialBoundary =
    definition.from > initialBoundaryStart &&
    definition.from < initialBoundaryTo;
  const rangeEndsInInitialHour =
    startOfHour(new Date(definition.to.getTime() - 1)).getTime() ===
    initialBoundaryStart.getTime();
  if (hasPartialInitialBoundary) {
    const initialMinuteRows =
      initialBoundaryStart.getTime() === currentHour.from.getTime() &&
      currentOpenMinuteRows
        ? currentOpenMinuteRows
        : await fetchAggregateRows(
            {
              granularity: "minute",
              from: definition.from,
              to: initialBoundaryTo,
            },
            companyScopeId,
            options,
          );
    hourlyRows = reconcileAggregateRows(
      hourlyRows,
      "hour",
      initialMinuteRows,
      "minute",
      definition.from,
      initialBoundaryTo,
    );
  }

  const historicalBoundaryStart = startOfHour(definition.to);
  const hasPartialHistoricalBoundary =
    historicalBoundaryStart < definition.to &&
    definition.to <= currentMinuteEnd &&
    !(hasPartialInitialBoundary && rangeEndsInInitialHour);
  const currentCutoffAlreadyReconciled =
    historicalBoundaryStart.getTime() === currentHour.from.getTime() &&
    definition.to >= currentMinuteEnd &&
    (reconciledCurrentCutoff || canonicalCoversCurrentRange);
  if (hasPartialHistoricalBoundary && !currentCutoffAlreadyReconciled) {
    const historicalMinuteRows = await fetchAggregateRows(
      {
        granularity: "minute",
        from: historicalBoundaryStart,
        to: definition.to,
      },
      companyScopeId,
      options,
    );
    hourlyRows = reconcileAggregateRows(
      hourlyRows,
      "hour",
      historicalMinuteRows,
      "minute",
      historicalBoundaryStart,
      definition.to,
    );
  }

  return hourlyRows;
}

async function fetchAggregateRows(
  definition: AggregateRangeDefinition,
  companyScopeId: string,
  options: ScenarioComparisonFetchOptions = {},
) {
  if (definition.granularity === "hour") {
    return fetchHourlyAggregateRanges({
      cache: options.cache,
      cacheScope:
        options.cacheScope ?? "scenario-comparison:uncached-request",
      companyScopeId,
      now: options.now,
      ranges: [definition],
      signal: options.signal,
    });
  }

  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: aggregateQueryIso(definition.from, definition.granularity),
    metric_type: DEFAULT_METRIC_TYPE,
    to: aggregateQueryIso(definition.to, definition.granularity),
  });
  const response = await apiFetch<AggregateEventsResponse>(
    `/analytics/aggregate?${params.toString()}`,
    options.signal
      ? { companyScopeId, signal: options.signal }
      : { companyScopeId },
  );
  requireAggregateGranularity(response.granularity, definition.granularity);

  return requireAggregateRowsInRange(
    response.data,
    definition.granularity,
    definition.from,
    definition.to,
    DEFAULT_METRIC_TYPE,
  );
}

function usesHourlyScenarioComparisonSource(
  definition: Pick<AggregateRangeDefinition, "from" | "to">,
) {
  return definition.to > definition.from;
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
      Math.min(currentMonthEnd.getTime(), requestedCurrentTo.getTime()),
    );
    const baselineFrom = settings.view === "days_year"
      ? new Date(currentFrom.getFullYear() - 1, currentFrom.getMonth(), 1)
      : addMonths(currentFrom, -1);
    const baselineMonthEnd = addMonths(baselineFrom, 1);
    const baselineElapsedTo = addDays(
      baselineFrom,
      calendarDayDistance(currentFrom, currentTo),
    );
    baselineElapsedTo.setHours(
      currentTo.getHours(),
      currentTo.getMinutes(),
      currentTo.getSeconds(),
      currentTo.getMilliseconds(),
    );
    const baselineTo = new Date(
      Math.min(baselineMonthEnd.getTime(), baselineElapsedTo.getTime()),
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

  const granularity = fitScenarioGranularityToRange(
    settings.granularity,
    range.from,
    range.to,
  );

  return {
    accumulated: settings.accumulated,
    currentFrom: new Date(range.from),
    currentTo: new Date(range.to),
    granularity,
    from: new Date(range.from),
    to: new Date(range.to),
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

  const currentMinuteEnd = addMinutes(startOfMinute(now), 1);
  if (settings.period === "last_24h") {
    return {
      from: addHours(currentMinuteEnd, -24),
      to: currentMinuteEnd,
    };
  }

  if (settings.period === "last_7d") {
    return {
      from: startOfDay(addDays(now, -6)),
      to: currentMinuteEnd,
    };
  }

  if (settings.period === "last_30d") {
    return {
      from: startOfDay(addDays(now, -29)),
      to: currentMinuteEnd,
    };
  }

  return { from: startOfDay(now), to: currentMinuteEnd };
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

  const currentDays = calendarDayBucketCount(
    definition.currentFrom,
    definition.currentTo,
  );
  const baselineDays = calendarDayBucketCount(
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
  definition: ScenarioComparisonDefinition,
  widgetColor?: string,
  referenceTime = new Date(),
): EnterpriseChartOption {
  const { granularity } = definition;
  const fixedHourlyWindow =
    granularity === "hour"
      ? resolveFixedHourlyDayWindow(
          definition.currentFrom,
          definition.currentTo,
          referenceTime,
        )
      : null;
  const fixedHourlyAxis = fixedHourlyWindow !== null;
  const hourlyThrough = fixedHourlyWindow?.throughHour ?? -1;
  const hourlyFrom = fixedHourlyWindow?.fromHour ?? 0;
  const bucketLabels = fixedHourlyAxis
    ? HOUR_OF_DAY_LABELS
    : series[0]?.points.map((point) => point.name) ?? [];
  const dense = !fixedHourlyAxis && bucketLabels.length > 12;
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
      bottom: fixedHourlyAxis ? 6 : dense ? 34 : 18,
      containLabel: true,
      left: fixedHourlyAxis ? 6 : 42,
      right: fixedHourlyAxis ? 10 : 18,
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
      axisLabel: fixedHourlyAxis
        ? {
            color: "#66758A",
            fontSize: 10,
            hideOverlap: true,
            interval: 1,
            rotate: 0,
          }
        : buildCalendarAxisLabel({
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
              {
                fromHour: hourlyFrom,
                missingHourValue: null,
              },
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
      definition,
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
  _bucketStart: Date,
  sourceRows: AggregateEventRow[],
  sourceGranularity: AggregateGranularity,
  sourceFrom: Date,
  sourceTo: Date,
) {
  return reconcileAggregateRows(
    rows,
    targetGranularity,
    sourceRows,
    sourceGranularity,
    sourceFrom,
    sourceTo,
  );
}

function listBucketStarts(definition: ScenarioComparisonDefinition) {
  const starts: Date[] = [];
  let cursor = alignToGranularity(definition.from, definition.granularity);
  const end = alignEndToGranularity(definition.to, definition.granularity);

  while (cursor < end) {
    const bucketStart = new Date(cursor);
    starts.push(bucketStart);
    cursor = addGranularity(bucketStart, definition.granularity);
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
  if (granularity === "hour") return endOfAggregateBucket(date, "hour");
  if (granularity === "day") return addDays(date, 1);
  if (granularity === "week") return addDays(date, 7);
  if (granularity === "month") return addMonths(date, 1);
  return addDays(date, 1);
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

function calendarDayBucketCount(from: Date, to: Date) {
  const calendarDays = calendarDayDistance(from, to);
  return (
    calendarDays +
    (to.getTime() > startOfDay(to).getTime() ? 1 : 0)
  );
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
  removeUserGridPreference(
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
    const stored = readUserViewScopedStorageEntry(
      scenarioComparisonStorageBaseKey(storageKey),
      companyId,
      scope.userId,
      scope.viewId,
    );
    if (!stored?.value) return createDefaultScenarioComparisonSettings();

    const parsed = JSON.parse(
      stored.value,
    ) as Partial<ScenarioComparisonSettings>;
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

  writeUserGridPreference(
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
    scenarioComparisonStorageBaseKey(storageKey),
    companyId,
    scope.userId,
    scope.viewId,
  );
}

function scenarioComparisonStorageBaseKey(storageKey: string) {
  return `ipxdata.${storageKey}.scenario-comparison.v1`;
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
