"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/app/auth-provider";
import { EChart, type EnterpriseChartOption } from "@/components/app/echart";
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
import { formatNumber } from "@/lib/utils";
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

type EmbeddedWidgetConfig = {
  chart: ViewChart;
  id: string;
  scopeId: string;
  title: string;
};

type EmbeddedWidgetState = {
  config: EmbeddedWidgetConfig;
  error: string;
  points: ChartPoint[];
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

const chartLabels: Record<ViewChart, string> = {
  "scenario-hour": "Hora a hora por cenário",
  "today-location": "Hoje por local",
  "today-scenario": "Hoje por cenário",
  "today-sub-location": "Hoje por sublocal",
};

export function EmbeddedLiveView() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const storedCompanyScopeId = useEffectiveCompanyScopeId(user);
  const chart = normalizeChart(searchParams.get("chart"));
  const queryCompanyId = searchParams.get("company_id")?.trim() ?? "";
  const companyScopeId = queryCompanyId || storedCompanyScopeId;
  const scopeId = searchParams.get("scope_id")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() || chartLabels[chart];
  const widgetsParam = searchParams.get("widgets");
  const widgetConfigs = React.useMemo(
    () =>
      parseWidgetConfigs(widgetsParam, {
        chart,
        id: "single",
        scopeId,
        title,
      }),
    [chart, scopeId, title, widgetsParam],
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

      setWidgetStates(
        widgetConfigs.map((config) =>
          buildEmbeddedWidgetState({
            config,
            liveHourRows,
            locationOptions,
            now,
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
        const title =
          typeof record.title === "string" && record.title.trim()
            ? record.title.trim()
            : chartLabels[chart];

        return {
          chart,
          id: `widget-${index}-${chart}-${scopeId || "all"}`,
          scopeId,
          title,
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
  scenarios,
  subLocationOptions,
}: {
  config: EmbeddedWidgetConfig;
  liveHourRows: AggregateEventRow[];
  locationOptions: ScopeComparisonOption[];
  now: Date;
  scenarios: Scenario[];
  subLocationOptions: ScopeComparisonOption[];
}): EmbeddedWidgetState {
  if (config.chart === "scenario-hour") {
    const scenario =
      scenarios.find((item) => item.id === config.scopeId) ??
      (!config.scopeId ? scenarios[0] : null) ??
      null;

    return {
      config,
      error: scenario ? "" : "Nenhum cenário disponível para esta visão.",
      points: scenario ? buildScenarioHourlyPoints(scenario, liveHourRows, now) : [],
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

function buildScenarioHourlyPoints(
  scenario: Scenario,
  rows: AggregateEventRow[],
  now: Date,
): ChartPoint[] {
  const todayStart = startOfDay(now);
  const end = addHours(startOfHour(now), 1);
  const points: ChartPoint[] = [];
  let cursor = todayStart;
  let index = 0;

  while (cursor < end && index < 24) {
    const next = addHours(cursor, 1);
    points.push({
      id: cursor.toISOString(),
      name: `${String(cursor.getHours()).padStart(2, "0")}h`,
      total: sumScenarioRowsInRange(rows, scenario, cursor, next),
    });
    cursor = next;
    index += 1;
  }

  return points;
}

function compareChartPoints(left: ChartPoint, right: ChartPoint) {
  return right.total - left.total || left.name.localeCompare(right.name, "pt-BR");
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
    bottom: 72,
    labelRotate: 28,
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
