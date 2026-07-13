"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/app/auth-provider";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
import {
  MonitorModeButton,
  MonitorModeExitHint,
  useMonitorMode,
} from "@/components/app/monitor-mode";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { hasMasterAccess } from "@/lib/access";
import {
  buildWorkerBackedLocationOptions,
  buildSubLocationCameraOptions,
  readCameraGroups,
  readWorkerLocationAssignments,
} from "@/lib/camera-groups";
import { pastelBarColor } from "@/lib/chart-palette";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import type {
  AggregateEventRow,
  AggregateEventsResponse,
  AggregateGranularity,
  Camera,
  Location,
  Scenario,
  SubLocation,
  Worker,
} from "@/lib/types";
import { formatNumber, formatTime } from "@/lib/utils";
import {
  annotateWorkerCompanyScope,
  normalizeWorkerRows,
  partitionWorkersByCompanyScope,
  sortWorkersByActivity,
} from "@/lib/worker-scope";

type ViewChart =
  | "today-scenario"
  | "today-location"
  | "today-sub-location"
  | "scenario-hour";

type ChartPoint = {
  id: string;
  name: string;
  total: number;
};

type ScenarioCompareGranularity = "hour" | "day" | "week" | "month";
type ScenarioComparePeriod =
  | "today"
  | "yesterday"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "custom";

type ScenarioComparisonSeries = {
  id: string;
  name: string;
  points: ChartPoint[];
};

type EmbeddedWidgetConfig = {
  chart: ViewChart;
  from?: string;
  granularity: ScenarioCompareGranularity;
  id: string;
  period: ScenarioComparePeriod;
  scenarioIds: string[];
  scopeId: string;
  title: string;
  to?: string;
};

type EmbeddedWidgetState = {
  config: EmbeddedWidgetConfig;
  error: string;
  points: ChartPoint[];
  scenarioSeries?: ScenarioComparisonSeries[];
};

type AggregateIdentityTotal = {
  cameraId: string;
  lineCountId: string;
  metricType: string;
  objectClass: string;
  total: number;
};

type AggregateDefinition = {
  granularity: AggregateGranularity;
  from: Date;
  to: Date;
};

type ScopeComparisonOption = {
  cameraIds: string[];
  id: string;
  name: string;
};

const DEFAULT_METRIC_TYPE = "count";
const REFRESH_SECONDS = 5;
const MAX_SCENARIO_SERIES = 12;

const chartLabels: Record<ViewChart, string> = {
  "scenario-hour": "Cenários por período",
  "today-location": "Hoje por local",
  "today-scenario": "Hoje por cenário",
  "today-sub-location": "Hoje por sublocal",
};

export function EmbeddedLiveView() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { enterMonitorMode, exitMonitorMode, monitorMode } = useMonitorMode();
  const storedCompanyScopeId = useEffectiveCompanyScopeId(user);
  const chart = normalizeChart(searchParams.get("chart"));
  const queryCompanyId = searchParams.get("company_id")?.trim() ?? "";
  const companyScopeId = queryCompanyId || storedCompanyScopeId;
  const scopeId = searchParams.get("scope_id")?.trim() ?? "";
  const scenarioIdsParam = searchParams.get("scenario_ids");
  const granularityParam = searchParams.get("granularity");
  const periodParam = searchParams.get("period");
  const fromParam = searchParams.get("from")?.trim() || undefined;
  const toParam = searchParams.get("to")?.trim() || undefined;
  const scenarioIds = React.useMemo(
    () => parseScenarioIdList(scenarioIdsParam),
    [scenarioIdsParam],
  );
  const title = searchParams.get("title")?.trim() || chartLabels[chart];
  const widgetsParam = searchParams.get("widgets");
  const widgetConfigs = React.useMemo(
    () =>
      parseWidgetConfigs(widgetsParam, {
        chart,
        from: fromParam,
        granularity: normalizeScenarioGranularity(granularityParam),
        id: "single",
        period: normalizeScenarioPeriod(periodParam),
        scenarioIds: scenarioIds.length ? scenarioIds : scopeId ? [scopeId] : [],
        scopeId,
        title,
        to: toParam,
      }),
    [
      chart,
      fromParam,
      granularityParam,
      periodParam,
      scenarioIds,
      scopeId,
      title,
      toParam,
      widgetsParam,
    ],
  );
  const multiWidgetMode = Boolean(widgetsParam);
  const [widgetStates, setWidgetStates] = React.useState<EmbeddedWidgetState[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    if (hasMasterAccess(user) && !companyScopeId) {
      setError("Empresa não definida para esta visão.");
      setLoading(false);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const now = new Date();
      const headers = companyScopeId
        ? ({ "X-Company-ID": companyScopeId } satisfies HeadersInit)
        : undefined;
      const [
        scenarioRows,
        cameraRows,
        locationRows,
        workerRows,
        hourRows,
        minuteRows,
      ] =
        await Promise.all([
          apiFetch<Scenario[]>("/scenarios", { headers }),
          apiFetch<Camera[]>("/cameras", { headers }).catch(() => []),
          apiFetch<Location[]>("/locations", { headers }).catch(() => []),
          fetchEmbeddedWorkers(companyScopeId).catch(() => []),
          fetchAggregateRows(buildAggregateDefinition(now, "hour"), headers),
          fetchAggregateRows(buildAggregateDefinition(now, "minute"), headers),
        ]);
      const scopedScenarios = filterScopedApiRows(
        scenarioRows,
        companyScopeId,
      ).filter((scenario) => scenario.active !== false);
      const scopedCameras = filterScopedApiRows(cameraRows, companyScopeId);
      const scopedLocations = filterScopedApiRows(locationRows, companyScopeId);
      const liveHourRows = hydrateCurrentHourRows(hourRows, minuteRows, now);
      const needsLocation = widgetConfigs.some(
        (widget) => widget.chart === "today-location",
      );
      const needsSubLocation = widgetConfigs.some(
        (widget) => widget.chart === "today-sub-location",
      );
      const locationOptions = needsLocation
        ? buildWorkerBackedLocationOptions({
            assignments: readWorkerLocationAssignments(companyScopeId),
            cameras: scopedCameras,
            locations: scopedLocations,
            manager: false,
            workers: workerRows,
          })
        : [];
      const subLocationOptions = needsSubLocation
        ? buildSubLocationCameraOptions({
            cameras: scopedCameras,
            groups: readCameraGroups(companyScopeId),
            locations: scopedLocations,
            manager: false,
            subLocations: filterScopedApiRows(
              await fetchSubLocations(scopedLocations, headers),
              companyScopeId,
            ),
          })
        : [];
      const scenarioRowsByConfigId = new Map(
        await Promise.all(
          widgetConfigs
            .filter((config) => config.chart === "scenario-hour")
            .map(async (config) => [
              config.id,
              await fetchScenarioComparisonRows(config, now, headers),
            ] as const),
        ),
      );

      setWidgetStates(
        widgetConfigs.map((config) =>
          buildEmbeddedWidgetState({
            config,
            liveHourRows,
            locationOptions,
            now,
            scenarioRows: scenarioRowsByConfigId.get(config.id) ?? [],
            scenarios: scopedScenarios,
            subLocationOptions,
          }),
        ),
      );
      setLastUpdated(now);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a visão.",
      );
    } finally {
      setLoading(false);
    }
  }, [companyScopeId, user, widgetConfigs]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, REFRESH_SECONDS * 1000);

    return () => window.clearInterval(interval);
  }, [load]);

  const visibleStates = widgetStates.length
    ? widgetStates
    : widgetConfigs.map((config) => ({ config, error: "", points: [] }));
  const firstState = visibleStates[0];

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {monitorMode ? (
        <MonitorModeExitHint onExit={exitMonitorMode} />
      ) : (
        <div className="fixed right-3 top-3 z-[120] opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
          <MonitorModeButton onClick={enterMonitorMode} />
        </div>
      )}

      {title ? (
        <header className="shrink-0 px-4 pb-2 pt-3 text-center">
          <h1
            className="font-semibold tracking-normal text-foreground"
            style={{ fontSize: "clamp(18px, 3vw, 56px)", lineHeight: 1.08 }}
          >
            {title}
          </h1>
          <div className="mt-1 text-[clamp(10px,1.05vw,14px)] text-muted-foreground">
            {lastUpdated
              ? `Atualizado ${lastUpdated.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "Atualizando a cada 5 segundos"}
          </div>
        </header>
      ) : null}

      <div className="min-h-0 flex-1 p-3 pt-1">
        {loading && !widgetStates.length ? (
          <Skeleton className="h-full w-full" />
        ) : error ? (
          <EmbeddedState text={error} />
        ) : multiWidgetMode ? (
          <div className="grid h-full min-h-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleStates.map((state) => (
              <section
                key={state.config.id}
                className="flex min-h-[260px] min-w-0 flex-col rounded-md border bg-card"
              >
                <header className="shrink-0 border-b px-3 py-2">
                  <h2 className="truncate text-sm font-semibold">
                    {state.config.title}
                  </h2>
                </header>
                <div className="min-h-0 flex-1 p-2">
                  <EmbeddedChartContent state={state} />
                </div>
              </section>
            ))}
          </div>
        ) : firstState ? (
          <EmbeddedChartContent state={firstState} />
        ) : (
          <EmbeddedState text="Sem dados disponíveis para esta visão." />
        )}
      </div>
    </main>
  );
}

function EmbeddedChartContent({ state }: { state: EmbeddedWidgetState }) {
  if (state.error) {
    return <EmbeddedState text={state.error} />;
  }

  if (state.scenarioSeries?.length) {
    return (
      <EChart
        option={buildScenarioComparisonChartOption(
          state.scenarioSeries,
          state.config.granularity,
        )}
      />
    );
  }

  if (state.points.length) {
    return <EChart option={buildOptionForChart(state.config.chart, state.points)} />;
  }

  return <EmbeddedState text="Sem dados disponíveis para esta visão." />;
}

function EmbeddedState({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function normalizeChart(value: string | null): ViewChart {
  if (
    value === "today-location" ||
    value === "today-sub-location" ||
    value === "scenario-hour"
  ) {
    return value;
  }

  return "today-scenario";
}

function normalizeScenarioGranularity(
  value: string | null,
): ScenarioCompareGranularity {
  if (
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "hour"
  ) {
    return value;
  }

  return "hour";
}

function normalizeScenarioPeriod(value: string | null): ScenarioComparePeriod {
  if (
    value === "yesterday" ||
    value === "last_24h" ||
    value === "last_7d" ||
    value === "last_30d" ||
    value === "custom" ||
    value === "today"
  ) {
    return value;
  }

  return "today";
}

function parseScenarioIdList(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseWidgetConfigs(
  value: string | null,
  fallback: EmbeddedWidgetConfig,
): EmbeddedWidgetConfig[] {
  if (!value) return [fallback];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [fallback];

    const widgets = parsed
      .map((item, index): EmbeddedWidgetConfig | null => {
        if (!item || typeof item !== "object") return null;

        const record = item as Record<string, unknown>;
        const chart = normalizeChart(
          typeof record.chart === "string" ? record.chart : null,
        );
        const scopeId =
          typeof record.scope_id === "string"
            ? record.scope_id
            : typeof record.scopeId === "string"
              ? record.scopeId
              : "";
        const scenarioIds = parseScenarioIdList(
          typeof record.scenario_ids === "string"
            ? record.scenario_ids
            : typeof record.scenarioIds === "string"
              ? record.scenarioIds
              : Array.isArray(record.scenario_ids)
                ? record.scenario_ids.join(",")
                : Array.isArray(record.scenarioIds)
                  ? record.scenarioIds.join(",")
                  : "",
        );
        const title =
          typeof record.title === "string" && record.title.trim()
            ? record.title.trim()
            : chartLabels[chart];

        return {
          chart,
          from: typeof record.from === "string" ? record.from : undefined,
          granularity: normalizeScenarioGranularity(
            typeof record.granularity === "string" ? record.granularity : null,
          ),
          id: `widget-${index}-${chart}-${scopeId || "all"}`,
          period: normalizeScenarioPeriod(
            typeof record.period === "string" ? record.period : null,
          ),
          scenarioIds: scenarioIds.length ? scenarioIds : scopeId ? [scopeId] : [],
          scopeId,
          title,
          to: typeof record.to === "string" ? record.to : undefined,
        };
      })
      .filter((widget): widget is EmbeddedWidgetConfig => Boolean(widget));

    return widgets.length ? widgets : [fallback];
  } catch {
    return [fallback];
  }
}

function buildEmbeddedWidgetState({
  config,
  liveHourRows,
  locationOptions,
  now,
  scenarioRows,
  scenarios,
  subLocationOptions,
}: {
  config: EmbeddedWidgetConfig;
  liveHourRows: AggregateEventRow[];
  locationOptions: ScopeComparisonOption[];
  now: Date;
  scenarioRows: AggregateEventRow[];
  scenarios: Scenario[];
  subLocationOptions: ScopeComparisonOption[];
}): EmbeddedWidgetState {
  if (config.chart === "scenario-hour") {
    const selectedScenarios = selectScenarioComparisonScenarios(
      scenarios,
      config.scenarioIds,
    );
    const definition = buildScenarioComparisonDefinition(config, now);

    return {
      config,
      error: selectedScenarios.length
        ? ""
        : "Nenhum cenário disponível para esta visão.",
      points: [],
      scenarioSeries: selectedScenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        points: buildScenarioComparisonPoints(
          scenario,
          scenarioRows,
          definition,
        ),
      })),
    };
  }

  if (config.chart === "today-scenario") {
    return {
      config,
      error: "",
      points: buildScenarioTodayComparisonPoints(scenarios, liveHourRows, now),
    };
  }

  if (config.chart === "today-location") {
    return {
      config,
      error: "",
      points: buildScopeTodayComparisonPoints(locationOptions, liveHourRows, now),
    };
  }

  return {
    config,
    error: "",
    points: buildScopeTodayComparisonPoints(
      subLocationOptions,
      liveHourRows,
      now,
    ),
  };
}

function buildOptionForChart(
  chart: ViewChart,
  points: ChartPoint[],
): EnterpriseChartOption {
  return chart === "scenario-hour"
    ? buildHourlyChartOption(points)
    : buildComparisonChartOption(points);
}

function buildAggregateDefinition(
  now: Date,
  granularity: "hour" | "minute",
): AggregateDefinition {
  if (granularity === "minute") {
    const end = addMinutes(startOfMinute(now), 1);
    return {
      granularity,
      from: addMinutes(end, -60),
      to: end,
    };
  }

  const end = addHours(startOfHour(now), 1);
  return {
    granularity,
    from: startOfDay(now),
    to: end,
  };
}

async function fetchAggregateRows(
  definition: AggregateDefinition,
  headers?: HeadersInit,
) {
  const params = new URLSearchParams({
    granularity: definition.granularity,
    from: definition.from.toISOString(),
    to: definition.to.toISOString(),
    metric_type: DEFAULT_METRIC_TYPE,
  });
  const response = await apiFetch<AggregateEventsResponse>(
    `/analytics/aggregate?${params.toString()}`,
    { headers },
  );

  return response.data ?? [];
}

async function fetchScenarioComparisonRows(
  config: EmbeddedWidgetConfig,
  now: Date,
  headers?: HeadersInit,
) {
  const definition = buildScenarioComparisonDefinition(config, now);
  const rows = await fetchAggregateRows(definition, headers);
  const openBucket = currentOpenBucket(definition.granularity, now);
  const sourceGranularity = sourceGranularityForOpenBucket(
    definition.granularity,
  );

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

async function fetchEmbeddedWorkers(
  companyId?: string | null,
): Promise<Worker[]> {
  const cleanCompanyId = companyId?.trim();
  const headers = cleanCompanyId
    ? ({ "X-Company-ID": cleanCompanyId } satisfies HeadersInit)
    : undefined;
  const rows = await apiFetch<unknown>("/workers", { headers }).then((response) =>
    normalizeWorkerRows(response).map((row) =>
      annotateWorkerCompanyScope(row, companyId, "GET /workers"),
    ),
  );
  const { scopedRows } = partitionWorkersByCompanyScope(rows, companyId);
  return sortWorkersByActivity(scopedRows);
}

async function fetchSubLocations(locations: Location[], headers?: HeadersInit) {
  const rows = await Promise.all(
    locations.map((location) =>
      apiFetch<SubLocation[]>(`/locations/${location.id}/sub-locations`, {
        headers,
      }).catch(() => []),
    ),
  );

  return rows.flat();
}

function hydrateCurrentHourRows(
  hourRows: AggregateEventRow[],
  minuteRows: AggregateEventRow[],
  now: Date,
) {
  const currentHourStart = startOfHour(now);
  const nextHourStart = addHours(currentHourStart, 1);
  const currentHourTime = currentHourStart.getTime();
  const stableRows = hourRows.filter((row) => {
    const bucket = new Date(row.bucket).getTime();
    return Number.isNaN(bucket) || bucket !== currentHourTime;
  });
  const currentRows = aggregateRowsIntoBucket(
    minuteRows,
    currentHourStart,
    nextHourStart,
  );

  return [...stableRows, ...currentRows];
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

function buildScenarioTodayComparisonPoints(
  scenarios: Scenario[],
  rows: AggregateEventRow[],
  now: Date,
): ChartPoint[] {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  return scenarios
    .map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      total: sumScenarioRowsInRange(rows, scenario, todayStart, tomorrowStart),
    }))
    .sort(compareChartPoints);
}

function buildScopeTodayComparisonPoints(
  scopes: Array<{ cameraIds: string[]; id: string; name: string }>,
  rows: AggregateEventRow[],
  now: Date,
): ChartPoint[] {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  return scopes
    .map((scope) => ({
      id: scope.id,
      name: scope.name,
      total: sumCameraRowsInRange(rows, scope.cameraIds, todayStart, tomorrowStart),
    }))
    .sort(compareChartPoints);
}

function buildScenarioComparisonDefinition(
  config: EmbeddedWidgetConfig,
  now: Date,
): AggregateDefinition {
  const range = scenarioComparisonRange(config, now);

  return {
    granularity: config.granularity,
    from: alignToGranularity(range.from, config.granularity),
    to: alignEndToGranularity(range.to, config.granularity),
  };
}

function scenarioComparisonRange(config: EmbeddedWidgetConfig, now: Date) {
  if (config.period === "custom") {
    const from = parseIsoDate(config.from);
    const to = parseIsoDate(config.to);
    if (from && to && from < to) return { from, to };
  }

  if (config.period === "yesterday") {
    const todayStart = startOfDay(now);
    return { from: addDays(todayStart, -1), to: todayStart };
  }

  if (config.period === "last_24h") {
    return { from: addHours(now, -24), to: now };
  }

  if (config.period === "last_7d") {
    return { from: startOfDay(addDays(now, -6)), to: now };
  }

  if (config.period === "last_30d") {
    return { from: startOfDay(addDays(now, -29)), to: now };
  }

  return { from: startOfDay(now), to: now };
}

function selectScenarioComparisonScenarios(
  scenarios: Scenario[],
  scenarioIds: string[],
) {
  if (!scenarioIds.length) return scenarios.slice(0, MAX_SCENARIO_SERIES);

  const selectedIds = new Set(scenarioIds);
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

function compareChartPoints(left: ChartPoint, right: ChartPoint) {
  return right.total - left.total || left.name.localeCompare(right.name, "pt-BR");
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

function parseIsoDate(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function sumCameraRowsInRange(
  rows: AggregateEventRow[],
  cameraIds: string[],
  from: Date,
  to: Date,
) {
  const cameraIdSet = new Set(cameraIds);
  const fromTime = from.getTime();
  const toTime = to.getTime();

  return rows.reduce((sum, row) => {
    if (!row.camera_id || !cameraIdSet.has(row.camera_id)) return sum;

    const bucket = new Date(row.bucket).getTime();
    if (Number.isNaN(bucket) || bucket < fromTime || bucket >= toTime) {
      return sum;
    }

    return sum + (row.total ?? 0);
  }, 0);
}

function scenarioMultiplierMap(scenario: Scenario) {
  return new Map(
    scenario.lines
      ?.filter((line) => line.action_multiplier !== 0)
      .map((line) => [line.line_count_id, line.action_multiplier ?? 1]) ?? [],
  );
}

function buildComparisonChartOption(points: ChartPoint[]): EnterpriseChartOption {
  const visiblePoints = points.slice(0, 12);

  return buildBarChartOption(visiblePoints, {
    bottom: 24,
    labelRotate: visiblePoints.length > 6 ? 18 : 0,
    maxBarWidth: 44,
  });
}

function buildHourlyChartOption(points: ChartPoint[]): EnterpriseChartOption {
  return buildBarChartOption(points, {
    bottom: 36,
    labelRotate: 0,
    maxBarWidth: 34,
  });
}

function buildScenarioComparisonChartOption(
  series: ScenarioComparisonSeries[],
  granularity: ScenarioCompareGranularity,
): EnterpriseChartOption {
  const bucketLabels = series[0]?.points.map((point) => point.name) ?? [];
  const dense = bucketLabels.length > 12;

  return {
    color: series.map((item, index) => pastelBarColor(index)),
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
            left: 0,
            right: 0,
            top: 0,
            type: "scroll",
            itemGap: 12,
            itemHeight: 10,
            itemWidth: 10,
            textStyle: {
              color: "#526477",
              fontSize: 12,
            },
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

function buildBarChartOption(
  points: ChartPoint[],
  {
    bottom,
    labelRotate,
    maxBarWidth,
  }: {
    bottom: number;
    labelRotate: number;
    maxBarWidth: number;
  },
): EnterpriseChartOption {
  return {
    color: ["#1267C4"],
    grid: {
      bottom,
      containLabel: true,
      left: 36,
      right: 18,
      top: 20,
    },
    tooltip: {
      axisPointer: {
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
        overflow: "truncate",
        rotate: labelRotate,
        width: labelRotate ? 96 : undefined,
      },
      axisLine: {
        lineStyle: {
          color: "#D8E3F2",
        },
      },
      axisTick: {
        show: false,
      },
      data: points.map((point) => point.name),
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
    series: [
      {
        barCategoryGap: "36%",
        barMaxWidth: maxBarWidth,
        data: points.map((point, index) => ({
          itemStyle: {
            color: pastelBarColor(index),
          },
          value: point.total,
        })),
        emphasis: {
          itemStyle: {
            color: "#0B4EA2",
          },
        },
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
        },
        name: "Hoje",
        type: "bar",
      },
    ],
  };
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
  return new Date(date.getTime() + minutes * 60_000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60_000);
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
