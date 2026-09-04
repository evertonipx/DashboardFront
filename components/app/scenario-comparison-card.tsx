"use client";

import * as React from "react";
import { BarChart3, Clock3, Settings2 } from "lucide-react";

import { useAuth } from "@/components/app/auth-provider";
import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
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
import { abortRequest } from "@/lib/request-cancellation";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import {
  aggregateBucketInRange,
  endOfAggregateBucket,
  startOfAggregateBucket,
} from "@/lib/aggregate-time";
import {
  fetchCompleteAggregateRange,
  type CompleteAggregateRequest,
} from "@/lib/aggregate-range-query";
import {
  reconcileAggregateRows,
} from "@/lib/aggregate-reconciliation";
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
  aggregateSource?: ScenarioComparisonAggregateSource;
  aggregateSourcePending?: boolean;
  aggregateRevision?: number | string;
  companyId?: string | null;
  companyTimeZone: string;
  deferSettingsApply?: boolean;
  description?: string;
  disabledReason?: string;
  hourlySource?: ScenarioComparisonHourlySource;
  hourlySourcePending?: boolean;
  hourlySourceRevision?: number | string | null;
  monitorMode?: boolean;
  onReportChartChange?: (
    key: string,
    chart: ReportPayload["charts"][number] | null,
  ) => void;
  periodOverride?: ScenarioComparisonPeriodOverride;
  preferenceScopeId?: string | null;
  reportChartKey?: string;
  scenarios: Scenario[];
  storageKey: string;
  title?: string;
};

export type ScenarioComparisonHourlySource = ScenarioComparisonSourceScope & {
  from: Date;
  rows: AggregateEventRow[];
  to: Date;
};

export type ScenarioComparisonAggregateSource =
  ScenarioComparisonHourlySource & {
    granularity: AggregateGranularity;
  };

export type ScenarioComparisonPeriodOverride = {
  from: Date;
  label: string;
  to: Date;
};

function scenarioComparisonHourlySourceRevision(
  source:
    | ScenarioComparisonHourlySource
    | ScenarioComparisonAggregateSource
    | undefined,
) {
  if (!source) return "none";
  const tail = source.rows.slice(-256).map((row) => [
    row.bucket,
    row.camera_id,
    row.line_count_id ?? "",
    row.metric_type,
    row.object_class ?? "",
    row.total,
  ]);
  return JSON.stringify([
    source.from.toISOString(),
    source.to.toISOString(),
    source.rows.length,
    tail,
  ]);
}

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

export function scenarioComparisonSettingsDataKey(
  settings: ScenarioComparisonSettings,
  hasPeriodOverride = false,
) {
  const period = hasPeriodOverride ? "fixed" : settings.period;
  const customPeriod = !hasPeriodOverride && settings.period === "custom";

  return JSON.stringify([
    settings.view,
    settings.view === "period" ? settings.granularity : "day",
    period,
    customPeriod ? settings.customFrom : "",
    customPeriod ? settings.customTo : "",
  ]);
}

export function scenarioComparisonSettingsPresentationKey(
  settings: ScenarioComparisonSettings,
) {
  return JSON.stringify([
    settings.accumulated,
    settings.selectionMode,
    settings.selectionMode === "custom"
      ? [...new Set(settings.selectedScenarioIds)].sort()
      : [],
  ]);
}

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
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_SHARED_AGGREGATE_RESPONSES = 256;

type SharedAggregateRequestEntry = {
  abortTimer: ReturnType<typeof setTimeout> | null;
  controller: AbortController;
  promise: Promise<AggregateEventsResponse>;
  subscribers: Set<symbol>;
};

const sharedAggregateResponses = new Map<string, AggregateEventsResponse>();
const sharedAggregateRequests = new Map<string, SharedAggregateRequestEntry>();

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
  aggregateSource,
  aggregateSourcePending = false,
  aggregateRevision,
  companyId,
  companyTimeZone,
  deferSettingsApply = false,
  description = "Compare os cenários escolhidos no mesmo gráfico.",
  disabledReason,
  hourlySource,
  hourlySourcePending = false,
  hourlySourceRevision,
  monitorMode = false,
  onReportChartChange,
  periodOverride,
  preferenceScopeId,
  reportChartKey,
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
  const [draftSettings, setDraftSettings] =
    React.useState<ScenarioComparisonSettings>(() =>
      createDefaultScenarioComparisonSettings(),
    );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [rows, setRows] = React.useState<AggregateEventRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [settingsReady, setSettingsReady] = React.useState(false);
  const [loadedDataRequestKey, setLoadedDataRequestKey] =
    React.useState("");
  const requestSequenceRef = React.useRef(0);
  const requestRef = React.useRef<AbortController | null>(null);
  const activeRequestKeyRef = React.useRef("");
  const completedRequestKeyRef = React.useRef("");
  const requestConsumerAttachedRef = React.useRef(false);
  const requestAbortTimerRef = React.useRef<number | null>(null);
  const scopeCertificationError = React.useMemo(() => {
    try {
      requireScenarioComparisonScope({
        companyScopeId: companyId,
        companyTimeZone,
        hourlySource: aggregateSource ?? hourlySource,
        scenarios,
      });
      return "";
    } catch (scopeError) {
      return userFacingErrorMessage(
        scopeError,
        "Não foi possível preparar esta comparação.",
      );
    }
  }, [aggregateSource, companyId, companyTimeZone, hourlySource, scenarios]);
  const effectiveDisabledReason = disabledReason || scopeCertificationError;
  const [loadedDefinition, setLoadedDefinition] =
    React.useState<ScenarioComparisonDefinition>(() =>
      buildScenarioComparisonDefinition(
        createDefaultScenarioComparisonSettings(),
        new Date(),
        periodOverride,
      ),
    );
  const definition = React.useMemo(
    () => ({ ...loadedDefinition, accumulated: settings.accumulated }),
    [loadedDefinition, settings.accumulated],
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
  const periodOverrideFromKey = periodOverride?.from.toISOString() ?? "";
  const periodOverrideToKey = periodOverride?.to.toISOString() ?? "";
  const dataView = settings.view;
  const dataGranularity =
    dataView === "period" ? settings.granularity : "day";
  const dataPeriod = periodOverride ? "today" : settings.period;
  const dataCustomFrom =
    !periodOverride && settings.period === "custom" ? settings.customFrom : "";
  const dataCustomTo =
    !periodOverride && settings.period === "custom" ? settings.customTo : "";
  const settingsDataKey = scenarioComparisonSettingsDataKey(
    settings,
    Boolean(periodOverride),
  );
  const hourlySourceRevisionKey = React.useMemo(
    () =>
      hourlySourceRevision ??
      scenarioComparisonHourlySourceRevision(hourlySource),
    [hourlySource, hourlySourceRevision],
  );
  const aggregateSourceRevisionKey = React.useMemo(
    () => scenarioComparisonHourlySourceRevision(aggregateSource),
    [aggregateSource],
  );
  const hourlySourceRef = React.useRef(hourlySource);
  const aggregateSourceRef = React.useRef(aggregateSource);
  React.useEffect(() => {
    hourlySourceRef.current = hourlySource;
    aggregateSourceRef.current = aggregateSource;
  }, [aggregateSource, hourlySource]);
  const dataRequestKey = React.useMemo(
    () =>
      JSON.stringify([
        companyId ?? "",
        companyTimeZone,
        aggregateRevision ?? "",
        aggregateSourceRevisionKey,
        periodOverrideFromKey,
        periodOverrideToKey,
        hourlySourceRevisionKey,
        settingsDataKey,
      ]),
    [
      companyId,
      companyTimeZone,
      aggregateRevision,
      aggregateSourceRevisionKey,
      hourlySourceRevisionKey,
      periodOverrideFromKey,
      periodOverrideToKey,
      settingsDataKey,
    ],
  );
  const hasScenarioSelection = selectedScenarios.length > 0;
  const buildDataDefinition = React.useCallback(
    (now: Date) =>
      buildScenarioComparisonDefinition(
        {
          accumulated: false,
          customFrom: dataCustomFrom,
          customTo: dataCustomTo,
          granularity: dataGranularity,
          period: dataPeriod,
          selectedScenarioIds: [],
          selectionMode: "all",
          view: dataView,
        },
        now,
        periodOverrideFromKey && periodOverrideToKey
          ? {
              from: new Date(periodOverrideFromKey),
              label: "",
              to: new Date(periodOverrideToKey),
            }
          : undefined,
      ),
    [
      dataCustomFrom,
      dataCustomTo,
      dataGranularity,
      dataPeriod,
      dataView,
      periodOverrideFromKey,
      periodOverrideToKey,
    ],
  );
  const loadedReportChart = React.useMemo(
    () =>
      loadedDataRequestKey === dataRequestKey &&
      lastUpdated &&
      !error &&
      !effectiveDisabledReason &&
      hasScenarioSelection
        ? buildScenarioComparisonReportChart({
            definition,
            periodLabelOverride: periodOverride?.label,
            rows,
            scenarios,
            settings,
            title: resolvedTitle,
            widgetColor,
          })
        : null,
    [
      definition,
      dataRequestKey,
      error,
      effectiveDisabledReason,
      hasScenarioSelection,
      lastUpdated,
      loadedDataRequestKey,
      periodOverride?.label,
      resolvedTitle,
      rows,
      scenarios,
      settings,
      widgetColor,
    ],
  );

  const load = React.useCallback(
    async (silent = false, force = false) => {
      if (hourlySourcePending || aggregateSourcePending) return;

      if (effectiveDisabledReason) {
        requestSequenceRef.current += 1;
        if (requestRef.current) {
          abortRequest(requestRef.current, "A comparação ficou indisponível.");
        }
        requestRef.current = null;
        activeRequestKeyRef.current = "";
        completedRequestKeyRef.current = "";
        setLoadedDataRequestKey("");
        setRows([]);
        setError(effectiveDisabledReason);
        setLastUpdated(null);
        setLoading(false);
        setLoadedDefinition(buildDataDefinition(new Date()));
        return;
      }

      if (!companyId) {
        completedRequestKeyRef.current = "";
        setLoadedDataRequestKey("");
        setRows([]);
        setError("Empresa não definida para esta comparação.");
        setLastUpdated(null);
        setLoading(false);
        return;
      }

      try {
        requireCountingRuntimeTimeZone(companyTimeZone);
      } catch (loadError) {
        completedRequestKeyRef.current = "";
        setLoadedDataRequestKey("");
        setRows([]);
        setError(userFacingErrorMessage(loadError, "Fuso da empresa não disponível."));
        setLastUpdated(null);
        setLoading(false);
        return;
      }

      if (
        !force &&
        (activeRequestKeyRef.current === dataRequestKey ||
          completedRequestKeyRef.current === dataRequestKey)
      ) {
        return;
      }

      const requestSequence = ++requestSequenceRef.current;
      if (requestRef.current) {
        abortRequest(requestRef.current, "A comparação anterior foi substituída.");
      }
      requestRef.current = null;
      if (force) completedRequestKeyRef.current = "";
      setLoadedDataRequestKey("");

      if (!silent) setLoading(true);
      setError("");
      const controller = new AbortController();
      requestRef.current = controller;
      activeRequestKeyRef.current = dataRequestKey;

      try {
        const now = new Date();
        const nextDefinition = buildDataDefinition(now);
        if (nextDefinition.to <= nextDefinition.from) {
          setLoadedDefinition(nextDefinition);
          setRows([]);
          setLastUpdated(null);
          return;
        }
        const nextRows = await fetchScenarioComparisonRows(
          nextDefinition,
          hourlySourceRef.current,
          companyTimeZone,
          companyId,
          {
            aggregateSource: aggregateSourceRef.current,
            now,
            requestRevision: force
              ? `manual:${Date.now()}`
              : aggregateRevision === undefined
                ? undefined
                : `parent:${aggregateRevision}`,
            signal: controller.signal,
          },
        );
        if (
          requestSequence !== requestSequenceRef.current ||
          !requestConsumerAttachedRef.current
        ) {
          return;
        }

        setLoadedDefinition(nextDefinition);
        setRows(nextRows);
        setLastUpdated(now);
        setLoadedDataRequestKey(dataRequestKey);
        completedRequestKeyRef.current = dataRequestKey;
      } catch (loadError) {
        if (requestSequence !== requestSequenceRef.current) return;
        if (!requestConsumerAttachedRef.current) return;
        if (loadError instanceof Error && loadError.name === "AbortError") {
          return;
        }
        setRows([]);
        setLastUpdated(null);
        setError(
          userFacingErrorMessage(
            loadError,
            "Não foi possível carregar a comparação de cenários.",
          ),
        );
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setLoading(false);
          if (requestRef.current === controller) requestRef.current = null;
        }
        if (activeRequestKeyRef.current === dataRequestKey) {
          activeRequestKeyRef.current = "";
        }
      }
    },
    [
      companyId,
      companyTimeZone,
      aggregateRevision,
      aggregateSourcePending,
      buildDataDefinition,
      dataRequestKey,
      effectiveDisabledReason,
      hourlySourcePending,
    ],
  );

  React.useEffect(() => {
    requestSequenceRef.current += 1;
    if (requestRef.current) {
      abortRequest(requestRef.current, "O escopo da comparação mudou.");
    }
    requestRef.current = null;
    activeRequestKeyRef.current = "";
    completedRequestKeyRef.current = "";
    setRows([]);
    setError("");
    setLastUpdated(null);
    setLoadedDataRequestKey("");
    setSettingsReady(false);
    const loadedSettings = loadSettings(storageKey, companyId, {
      userId: user?.id,
      viewId: preferenceScopeId,
    });
    setSettings(loadedSettings);
    setDraftSettings(loadedSettings);
    setSettingsReady(true);
  }, [companyId, companyTimeZone, preferenceScopeId, storageKey, user?.id]);

  React.useEffect(() => {
    requestConsumerAttachedRef.current = true;
    if (requestAbortTimerRef.current !== null) {
      window.clearTimeout(requestAbortTimerRef.current);
      requestAbortTimerRef.current = null;
    }

    return () => {
      requestConsumerAttachedRef.current = false;
      requestAbortTimerRef.current = window.setTimeout(() => {
        requestAbortTimerRef.current = null;
        if (requestConsumerAttachedRef.current) return;
        requestSequenceRef.current += 1;
        if (requestRef.current) {
          abortRequest(requestRef.current, "A comparação saiu da tela.");
        }
        requestRef.current = null;
        activeRequestKeyRef.current = "";
      }, 0);
    };
  }, []);

  React.useEffect(() => {
    setSettings((current) => ({
      ...current,
      selectedScenarioIds: current.selectedScenarioIds.filter((id) =>
        scenarios.some((scenario) => scenario.id === id),
      ),
    }));
    setDraftSettings((current) => ({
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
    if (!hasScenarioSelection) {
      requestSequenceRef.current += 1;
      if (requestRef.current) {
        abortRequest(
          requestRef.current,
          "A comparação ficou sem cenários selecionados.",
        );
      }
      requestRef.current = null;
      activeRequestKeyRef.current = "";
      setLoading(false);
      return;
    }
    void load();
  }, [hasScenarioSelection, load, settingsReady]);

  React.useEffect(() => {
    if (!onReportChartChange || !reportChartKey) return;
    onReportChartChange(reportChartKey, loadedReportChart);
  }, [loadedReportChart, onReportChartChange, reportChartKey]);

  React.useEffect(() => {
    if (monitorMode) setSettingsOpen(false);
  }, [monitorMode]);

  function openSettings() {
    if (deferSettingsApply) setDraftSettings(settings);
    setSettingsOpen(true);
  }

  function updateSettings(next: Partial<ScenarioComparisonSettings>) {
    if (deferSettingsApply) {
      setDraftSettings((current) => ({ ...current, ...next }));
      return;
    }
    setSettings((current) => ({ ...current, ...next }));
  }

  function completeSettings() {
    if (deferSettingsApply) setSettings(draftSettings);
    setSettingsOpen(false);
  }

  return (
    <Card
      className={cn(
        "@container min-w-0 overflow-hidden flex h-full min-h-0 flex-col",
        monitorMode && "shadow-none",
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
                onClick={openSettings}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configurar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          monitorMode && "pt-2",
        )}
        data-echart-layout="natural"
      >
        <div
          aria-label="Gráfico comparativo responsivo"
          className="h-full min-h-0 w-full flex-1 overflow-hidden"
          role="region"
        >
          {loading && !rows.length ? (
            <Skeleton className="h-full min-h-0 w-full flex-1 self-stretch" />
          ) : effectiveDisabledReason || error ? (
            <ChartState text={effectiveDisabledReason || error} />
          ) : settings.selectionMode === "custom" &&
            !settings.selectedScenarioIds.length ? (
            <ChartState text="Selecione ao menos um cenário para comparar." />
          ) : !selectedScenarios.length ? (
            <ChartState text="Nenhum cenário disponível para comparar." />
          ) : hasData ? (
            <EChart className="h-full min-h-0 w-full flex-1" option={option} />
          ) : (
            <ChartState text="Sem eventos nos cenários selecionados para este período." />
          )}
        </div>
      </CardContent>
      <Dialog
        open={settingsOpen && !monitorMode}
        onOpenChange={(open) => {
          if (open) openSettings();
          else setSettingsOpen(false);
        }}
      >
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
              settings={deferSettingsApply ? draftSettings : settings}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={completeSettings}>
              {deferSettingsApply ? "Aplicar" : "Concluir"}
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

      <Field label="Agrupamento">
        {settings.view === "period" ? (
        <Select
          value={settings.granularity}
          onValueChange={(value) =>
            onChange({ granularity: value as ScenarioCompareGranularity })
          }
        >
          <SelectTrigger aria-label="Agrupamento"><SelectValue /></SelectTrigger>
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
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 self-stretch items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
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
        {
          ...options,
          companyTimeZone: certifiedScope.companyTimeZone,
        },
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
  aggregateSource?: ScenarioComparisonAggregateSource;
  companyTimeZone?: string;
  now?: Date;
  requestRevision?: string;
  signal?: AbortSignal;
};

async function fetchScenarioComparisonRangeRows(
  definition: AggregateRangeDefinition,
  companyScopeId: string,
  hourlySource?: ScenarioComparisonHourlySource,
  options: ScenarioComparisonFetchOptions = {},
) {
  if (definition.granularity !== "hour") {
    return fetchConsolidatedScenarioComparisonRangeRows(
      definition,
      companyScopeId,
      hourlySource,
      options,
    );
  }

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
  const missingHourlyRanges = hasProvidedSource
    ? []
    : hasSourceIntersection && sourceIntersectionFrom && sourceIntersectionTo
      ? [
          {
            ...hourlyDefinition,
            to: sourceIntersectionFrom,
          },
          {
            ...hourlyDefinition,
            from: sourceIntersectionTo,
          },
        ].filter((range) => range.from < range.to)
      : [hourlyDefinition];
  let hourlyRows = (
    await Promise.all(
      missingHourlyRanges.map((range) =>
        fetchAggregateRows(range, companyScopeId, options),
      ),
    )
  ).flat();
  if (hasProvidedSource && hourlySource) {
    hourlyRows = hourlySource.rows.filter((row) =>
      aggregateBucketInRange(
        row.bucket,
        "hour",
        hourlyDefinition.from,
        hourlyDefinition.to,
      ),
    );
  }
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

async function fetchConsolidatedScenarioComparisonRangeRows(
  definition: AggregateRangeDefinition,
  companyScopeId: string,
  hourlySource: ScenarioComparisonHourlySource | undefined,
  options: ScenarioComparisonFetchOptions,
) {
  const granularity = definition.granularity;
  const lastInstant = new Date(definition.to.getTime() - 1);
  const firstBoundaryStart = startOfAggregateBucket(
    definition.from,
    granularity,
  );
  const lastBoundaryStart = startOfAggregateBucket(lastInstant, granularity);
  const firstBoundaryPartial = definition.from > firstBoundaryStart;
  const lastBoundaryPartial = definition.to < endOfAggregateBucket(
    lastInstant,
    granularity,
  );
  const fullFrom = firstBoundaryPartial
    ? endOfAggregateBucket(definition.from, granularity)
    : definition.from;
  const fullTo = lastBoundaryPartial ? lastBoundaryStart : definition.to;
  const aggregateSource = options.aggregateSource?.granularity === granularity
    ? options.aggregateSource
    : undefined;
  const sourceFrom = aggregateSource
    ? new Date(Math.max(fullFrom.getTime(), aggregateSource.from.getTime()))
    : null;
  const sourceTo = aggregateSource
    ? new Date(Math.min(fullTo.getTime(), aggregateSource.to.getTime()))
    : null;
  const hasSourceIntersection = Boolean(
    sourceFrom && sourceTo && sourceFrom < sourceTo,
  );
  const completeSourceCoverage = Boolean(
    aggregateSource &&
      aggregateSource.from <= fullFrom &&
      aggregateSource.to >= fullTo,
  );
  const missingFullRanges =
    fullFrom >= fullTo || completeSourceCoverage
      ? []
      : hasSourceIntersection && sourceFrom && sourceTo
        ? [
            { from: fullFrom, granularity, to: sourceFrom },
            { from: sourceTo, granularity, to: fullTo },
          ].filter((range) => range.from < range.to)
        : [{ from: fullFrom, granularity, to: fullTo }];
  let rows = (
    await Promise.all(
      missingFullRanges.map((range) =>
        fetchAggregateRows(range, companyScopeId, options),
      ),
    )
  ).flat();
  if (
    hasSourceIntersection &&
    aggregateSource &&
    sourceFrom &&
    sourceTo
  ) {
    rows = reconcileAggregateRows(
      rows,
      granularity,
      aggregateSource.rows,
      granularity,
      sourceFrom,
      sourceTo,
    );
  }
  const boundaryRanges: Array<{ from: Date; to: Date }> = [];

  if (
    firstBoundaryStart.getTime() === lastBoundaryStart.getTime() &&
    (firstBoundaryPartial || lastBoundaryPartial)
  ) {
    boundaryRanges.push({ from: definition.from, to: definition.to });
  } else {
    if (firstBoundaryPartial) {
      boundaryRanges.push({
        from: definition.from,
        to: endOfAggregateBucket(definition.from, granularity),
      });
    }
    if (lastBoundaryPartial) {
      boundaryRanges.push({
        from: lastBoundaryStart,
        to: definition.to,
      });
    }
  }

  for (const boundary of boundaryRanges) {
    const hourlyRows = await fetchScenarioComparisonRangeRows(
      { ...boundary, granularity: "hour" },
      companyScopeId,
      hourlySource,
      options,
    );
    rows = reconcileAggregateRows(
      rows,
      granularity,
      hourlyRows,
      "hour",
      boundary.from,
      boundary.to,
    );
  }

  return rows;
}

async function fetchAggregateRows(
  definition: AggregateRangeDefinition,
  companyScopeId: string,
  options: ScenarioComparisonFetchOptions = {},
) {
  const now = options.now ?? new Date();
  const request: CompleteAggregateRequest = (path) =>
    requestSharedScenarioComparisonAggregate({
      companyScopeId,
      companyTimeZone: options.companyTimeZone ?? "UTC",
      now,
      path,
      requestRevision: options.requestRevision,
      signal: options.signal,
    });

  return fetchCompleteAggregateRange({
    companyScopeId,
    from: definition.from,
    granularity: definition.granularity,
    metricType: DEFAULT_METRIC_TYPE,
    request,
    signal: options.signal,
    to: definition.to,
  });
}

function requestSharedScenarioComparisonAggregate({
  companyScopeId,
  companyTimeZone,
  now,
  path,
  requestRevision,
  signal,
}: {
  companyScopeId: string;
  companyTimeZone: string;
  now: Date;
  path: string;
  requestRevision?: string;
  signal?: AbortSignal;
}) {
  const key = sharedAggregateRequestKey({
    companyScopeId,
    companyTimeZone,
    now,
    path,
    requestRevision,
  });
  const cached = sharedAggregateResponses.get(key);
  if (cached) {
    signal?.throwIfAborted();
    sharedAggregateResponses.delete(key);
    sharedAggregateResponses.set(key, cached);
    return Promise.resolve(cached);
  }

  let entry = sharedAggregateRequests.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = apiFetch<AggregateEventsResponse>(path, {
      companyScopeId,
      signal: controller.signal,
    });
    entry = {
      abortTimer: null,
      controller,
      promise,
      subscribers: new Set(),
    };
    sharedAggregateRequests.set(key, entry);
    promise.then(
      (response) => {
        if (!controller.signal.aborted) {
          rememberSharedAggregateResponse(key, response);
        }
        if (sharedAggregateRequests.get(key) === entry) {
          sharedAggregateRequests.delete(key);
        }
      },
      () => {
        if (sharedAggregateRequests.get(key) === entry) {
          sharedAggregateRequests.delete(key);
        }
      },
    );
  }

  return subscribeToSharedAggregateRequest(entry, signal);
}

function subscribeToSharedAggregateRequest(
  entry: SharedAggregateRequestEntry,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const subscriber = Symbol("scenario-comparison-request");
  entry.subscribers.add(subscriber);
  if (entry.abortTimer) {
    clearTimeout(entry.abortTimer);
    entry.abortTimer = null;
  }

  return new Promise<AggregateEventsResponse>((resolve, reject) => {
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      entry.subscribers.delete(subscriber);
      if (!entry.subscribers.size && !entry.controller.signal.aborted) {
        entry.abortTimer = setTimeout(() => {
          entry.abortTimer = null;
          if (!entry.subscribers.size) {
            abortRequest(
              entry.controller,
              "A consulta compartilhada ficou sem consumidores.",
            );
          }
        }, 0);
      }
    };
    const onAbort = () => {
      release();
      reject(abortReason(signal));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (response) => {
        if (signal?.aborted) {
          onAbort();
          return;
        }
        release();
        resolve(response);
      },
      (error) => {
        release();
        reject(error);
      },
    );
  });
}

function sharedAggregateRequestKey({
  companyScopeId,
  companyTimeZone,
  now,
  path,
  requestRevision,
}: {
  companyScopeId: string;
  companyTimeZone: string;
  now: Date;
  path: string;
  requestRevision?: string;
}) {
  const url = new URL(path, "http://ipxdata.local");
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  const intersectsOpenBucket =
    !Number.isNaN(from.getTime()) &&
    !Number.isNaN(to.getTime()) &&
    from <= now &&
    now < to;
  const revision = requestRevision ?? (intersectsOpenBucket
    ? `open:${startOfMinute(now).toISOString()}`
    : "closed");

  return JSON.stringify([
    companyScopeId,
    companyTimeZone,
    path,
    revision,
  ]);
}

function rememberSharedAggregateResponse(
  key: string,
  response: AggregateEventsResponse,
) {
  sharedAggregateResponses.set(key, response);
  while (sharedAggregateResponses.size > MAX_SHARED_AGGREGATE_RESPONSES) {
    const oldestKey = sharedAggregateResponses.keys().next().value;
    if (typeof oldestKey !== "string") break;
    sharedAggregateResponses.delete(oldestKey);
  }
}

function abortReason(signal?: AbortSignal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("A consulta foi cancelada.", "AbortError");
}

function usesHourlyScenarioComparisonSource(
  definition: Pick<AggregateRangeDefinition, "from" | "granularity" | "to">,
) {
  return definition.granularity === "hour" && definition.to > definition.from;
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
