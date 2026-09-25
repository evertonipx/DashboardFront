"use client";

import * as React from "react";
import { ChartNoAxesCombined, Clock3, Grid3X3, Sigma } from "lucide-react";

import {
  EChart,
  type EnterpriseChartOption,
} from "@/components/app/deferred-echart";
import { getOccupancyChartPalette } from "@/components/app/occupancy-chart-palette";
import { useTheme } from "@/components/app/theme-provider";
import {
  WidgetTitleText,
  useWidgetColor,
} from "@/components/app/widget-appearance";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  heatmapLabelColor,
  monochromeHeatmapPalette,
} from "@/lib/chart-palette";
import {
  formatOccupancyLoiteringDuration,
  type OccupancyLoiteringSessionRow,
  type OccupancyLoiteringSummaryModel,
} from "@/lib/occupancy-loitering";
import {
  buildOccupancyLoiteringTemporalModel,
  type OccupancyLoiteringTemporalArea,
  type OccupancyLoiteringTemporalModel,
} from "@/lib/occupancy-loitering-temporal";
import { occupancyHeatmapStateColors } from "@/lib/occupancy-heatmap-visual";
import type { ReportChart, ReportTable } from "@/lib/report-export";
import { formatDateTime } from "@/lib/utils";

export const OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID =
  "occupancy_loitering_sessions_over_time" as const;
export const OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID =
  "occupancy_loitering_average_over_time" as const;
export const OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID =
  "occupancy_loitering_accumulated_session_time" as const;
export const OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID =
  "occupancy_loitering_percentiles_by_area" as const;
export const OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID =
  "occupancy_loitering_duration_distribution" as const;
export const OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID =
  "occupancy_loitering_area_period_heatmap" as const;

export const OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS = [
  OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID,
  OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID,
  OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID,
  OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID,
] as const;

export type OccupancyLoiteringTemporalCardId =
  | typeof OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID
  | typeof OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID
  | typeof OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID
  | typeof OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID
  | typeof OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID
  | typeof OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID;

export const OCCUPANCY_LOITERING_TEMPORAL_LABELS: Record<
  OccupancyLoiteringTemporalCardId,
  string
> = {
  occupancy_loitering_sessions_over_time:
    "Sessões concluídas ao longo do tempo",
  occupancy_loitering_average_over_time:
    "Permanência média ao longo do tempo",
  occupancy_loitering_accumulated_session_time:
    "Duração acumulada das permanências",
  occupancy_loitering_percentiles_by_area: "Mediana e P90 por área",
  occupancy_loitering_duration_distribution:
    "Distribuição das permanências",
  occupancy_loitering_area_period_heatmap:
    "Permanência média · áreas × períodos",
};

export type OccupancyLoiteringTemporalPeriod = {
  contextLabel: string;
  from: Date;
  to: Date;
};

export type OccupancyLoiteringTemporalCardProps = {
  dataPeriod?: Pick<OccupancyLoiteringTemporalPeriod, "from" | "to"> & {
    contextLabel?: string;
  };
  error?: string;
  kind: OccupancyLoiteringTemporalCardId;
  loading: boolean;
  model: OccupancyLoiteringSummaryModel;
  monitorMode?: boolean;
  period: OccupancyLoiteringTemporalPeriod;
  sessions: readonly OccupancyLoiteringSessionRow[];
  sessionsSlicedByDay?: boolean;
  temporalModel?: OccupancyLoiteringTemporalModel | null;
  timeZone: string;
};

export type OccupancyLoiteringTemporalReportAsset = {
  cardId: OccupancyLoiteringTemporalCardId;
  chart: ReportChart;
};

type ChartTheme = "dark" | "light";
type TemporalPeriodSource = Pick<
  OccupancyLoiteringTemporalPeriod,
  "from" | "to"
>;
type DurationScale = {
  fromAxis: (value: number) => number;
  logarithmic: boolean;
  toAxis: (value: number) => number;
};

const SERIES_COLORS = [
  "#1267C4",
  "#0F766E",
  "#7C3AED",
  "#C2410C",
  "#0369A1",
  "#BE123C",
  "#15803D",
  "#A16207",
] as const;

const DEFAULT_WIDGET_COLORS: Record<
  OccupancyLoiteringTemporalCardId,
  string
> = {
  occupancy_loitering_sessions_over_time: "#1267C4",
  occupancy_loitering_average_over_time: "#0F766E",
  occupancy_loitering_accumulated_session_time: "#7C3AED",
  occupancy_loitering_percentiles_by_area: "#0369A1",
  occupancy_loitering_duration_distribution: "#C2410C",
  occupancy_loitering_area_period_heatmap: "#1267C4",
};

const temporalModelCache = new WeakMap<
  readonly OccupancyLoiteringSessionRow[],
  Map<string, OccupancyLoiteringTemporalModel>
>();

/**
 * Creates one deterministic model for every temporal widget. Repeated cards
 * sharing the same session array, scope and civil interval reuse the exact
 * same object and never regroup the payload independently.
 */
export function buildSharedOccupancyLoiteringTemporalModel({
  dataPeriod,
  model,
  period,
  sessions,
  timeZone,
}: {
  dataPeriod?: TemporalPeriodSource;
  model: OccupancyLoiteringSummaryModel;
  period: TemporalPeriodSource;
  sessions: readonly OccupancyLoiteringSessionRow[];
  timeZone: string;
}) {
  const sourcePeriod = dataPeriod ?? period;
  const cacheKey = JSON.stringify([
    sourcePeriod.from.toISOString(),
    sourcePeriod.to.toISOString(),
    timeZone,
    model.areas.map((area) => area.key),
    model.scenarios.map((scenario) => [
      scenario.scenarioId,
      scenario.areas.map((area) => area.key),
    ]),
  ]);
  let byScope = temporalModelCache.get(sessions);
  if (!byScope) {
    byScope = new Map();
    temporalModelCache.set(sessions, byScope);
  }
  const cached = byScope.get(cacheKey);
  if (cached) return cached;
  const temporalModel = buildOccupancyLoiteringTemporalModel({
    context: model,
    from: sourcePeriod.from,
    granularity: "auto",
    maxBuckets: 180,
    sessions,
    sessionsCertifiedByApi: true,
    timeZone,
    to: sourcePeriod.to,
  });
  byScope.set(cacheKey, temporalModel);
  return temporalModel;
}

export function OccupancyLoiteringTemporalCard({
  dataPeriod,
  error,
  kind,
  loading,
  model,
  monitorMode = false,
  period,
  sessions,
  sessionsSlicedByDay = false,
  temporalModel: suppliedTemporalModel,
  timeZone,
}: OccupancyLoiteringTemporalCardProps) {
  const { effectiveTheme } = useTheme();
  const configuration = temporalCardConfiguration(kind);
  const widgetColor = useWidgetColor(DEFAULT_WIDGET_COLORS[kind]);
  const buildResult = React.useMemo(() => {
    if (suppliedTemporalModel) {
      return { model: suppliedTemporalModel, error: undefined };
    }
    try {
      return {
        error: undefined,
        model: buildSharedOccupancyLoiteringTemporalModel({
          dataPeriod,
          model,
          period,
          sessions,
          timeZone,
        }),
      };
    } catch (buildError) {
      return {
        error:
          buildError instanceof Error
            ? buildError.message
            : "Não foi possível consolidar as permanências.",
        model: null,
      };
    }
  }, [dataPeriod, model, period, sessions, suppliedTemporalModel, timeZone]);
  const temporalModel = buildResult.model;
  const resolvedError = error ?? buildResult.error;
  const option = React.useMemo(
    () =>
      temporalModel && temporalModel.totals.count > 0
        ? buildOccupancyLoiteringTemporalChartOption(
            kind,
            temporalModel,
            effectiveTheme === "dark" ? "dark" : "light",
            widgetColor,
          )
        : null,
    [effectiveTheme, kind, temporalModel, widgetColor],
  );
  const sourcePeriod = dataPeriod ?? period;
  const effectiveDataLabel = temporalDataPeriodLabel(
    sourcePeriod,
    timeZone,
    dataPeriod?.contextLabel,
  );
  const description = temporalDescription(
    kind,
    sessionsSlicedByDay,
    effectiveDataLabel,
  );
  const Icon = configuration.icon;

  return (
    <Card
      className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-monitor-mode={monitorMode || undefined}
      data-occupancy-loitering-temporal={kind}
    >
      <CardHeader className="min-w-0 gap-1 p-3 pb-1">
        <CardTitle className="flex min-w-0 items-start gap-2">
          <Icon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: widgetColor }}
          />
          <WidgetTitleText fallback={configuration.title} />
        </CardTitle>
        <CardDescription
          className="line-clamp-2 text-xs leading-4"
          title={description}
        >
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-3 pt-1">
        {resolvedError ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground"
            role="status"
          >
            {resolvedError}
          </div>
        ) : loading && !sessions.length ? (
          <Skeleton className="min-h-28 w-full flex-1" />
        ) : !option ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground">
            Nenhuma permanência foi concluída no intervalo carregado.
          </div>
        ) : (
          <div
            aria-busy={loading}
            className="min-h-28 min-w-0 flex-1"
            data-echart-layout="natural"
          >
            <EChart
              ariaDescription={configuration.ariaDescription}
              ariaLabel={configuration.title}
              className="h-full min-h-0 w-full"
              option={option}
              themeMode="explicit"
              valueLabels="always"
            />
          </div>
        )}
        {!monitorMode && kind === OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID ? (
          <p className="mt-1 shrink-0 truncate text-[10px] leading-4 text-muted-foreground">
            Soma das durações individuais; não representa tempo ocupado da área.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function buildOccupancyLoiteringTemporalChartOption(
  kind: OccupancyLoiteringTemporalCardId,
  model: OccupancyLoiteringTemporalModel,
  theme: ChartTheme = "light",
  widgetColor = DEFAULT_WIDGET_COLORS[kind],
  interactive = true,
): EnterpriseChartOption {
  switch (kind) {
    case OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID:
      return buildOccupancyLoiteringSessionsOverTimeOption(
        model,
        theme,
        widgetColor,
        interactive,
      );
    case OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID:
      return buildOccupancyLoiteringAverageOverTimeOption(
        model,
        theme,
        widgetColor,
        interactive,
      );
    case OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID:
      return buildOccupancyLoiteringAccumulatedSessionTimeOption(
        model,
        theme,
        widgetColor,
        interactive,
      );
    case OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID:
      return buildOccupancyLoiteringPercentilesByAreaOption(
        model,
        theme,
        widgetColor,
        interactive,
      );
    case OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID:
      return buildOccupancyLoiteringDurationDistributionOption(
        model,
        theme,
        widgetColor,
        interactive,
      );
    case OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID:
      return buildOccupancyLoiteringAreaPeriodHeatmapOption(
        model,
        theme,
        widgetColor,
        interactive,
      );
  }
}

export function buildOccupancyLoiteringSessionsOverTimeOption(
  model: OccupancyLoiteringTemporalModel,
  theme: ChartTheme = "light",
  widgetColor = "#1267C4",
  interactive = true,
) {
  return buildTemporalLineOption({
    interactive,
    metric: "sessions",
    model,
    theme,
    widgetColor,
  });
}

export function buildOccupancyLoiteringAverageOverTimeOption(
  model: OccupancyLoiteringTemporalModel,
  theme: ChartTheme = "light",
  widgetColor = "#0F766E",
  interactive = true,
) {
  return buildTemporalLineOption({
    interactive,
    metric: "average",
    model,
    theme,
    widgetColor,
  });
}

export function buildOccupancyLoiteringAccumulatedSessionTimeOption(
  model: OccupancyLoiteringTemporalModel,
  theme: ChartTheme = "light",
  widgetColor = "#7C3AED",
  interactive = true,
) {
  return buildTemporalLineOption({
    interactive,
    metric: "accumulated",
    model,
    theme,
    widgetColor,
  });
}

type TemporalLineMetric = "accumulated" | "average" | "sessions";

function buildTemporalLineOption({
  interactive,
  metric,
  model,
  theme,
  widgetColor,
}: {
  interactive: boolean;
  metric: TemporalLineMetric;
  model: OccupancyLoiteringTemporalModel;
  theme: ChartTheme;
  widgetColor: string;
}): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const areas = model.areas.filter((area) => area.stats.count > 0);
  const labels = areaPresentationLabels(areas);
  const pointsByArea = areas.map((area) => {
    let accumulated = 0;
    let accumulatedSessions = 0;
    return area.buckets.map((bucket) => {
      if (metric === "sessions") {
        return { hasSessions: bucket.count > 0, rawValue: bucket.count };
      }
      if (metric === "average") {
        return {
          hasSessions: bucket.count > 0,
          rawValue: bucket.avgDurationSeconds,
        };
      }
      accumulated += bucket.sumDurationSeconds;
      accumulatedSessions += bucket.count;
      return {
        hasSessions: accumulatedSessions > 0,
        rawValue: accumulatedSessions > 0 ? accumulated : null,
      };
    });
  });
  const durationValues = metric === "sessions"
    ? []
    : pointsByArea.flatMap((points) =>
        points.flatMap(({ rawValue }) =>
          rawValue !== null && rawValue > 0 ? [rawValue] : [],
        ),
      );
  const durationScale = buildDurationScale(durationValues);
  const colors = [widgetColor, ...SERIES_COLORS.filter((color) => color !== widgetColor)];
  const showLabels = model.buckets.length <= 18 && areas.length <= 4;
  const showZoom = interactive && model.buckets.length > 32;
  const series = areas.map((area, areaIndex) => ({
    animation: false,
    connectNulls: false,
    data: pointsByArea[areaIndex].map(({ hasSessions, rawValue }, bucketIndex) => ({
      areaIndex,
      bucketIndex,
      hasSessions,
      rawValue,
      value:
        rawValue === null
          ? null
          : metric === "sessions"
            ? rawValue
            : durationScale.toAxis(rawValue),
    })),
    emphasis: { focus: "series" },
    id: `loitering-temporal-${metric}-${areaIndex}`,
    itemStyle: { color: colors[areaIndex % colors.length] },
    label: {
      color: palette.axisText,
      fontSize: 9,
      formatter: (params: unknown) => {
        const datum = temporalDatum(params);
        if (!datum || datum.rawValue === null || datum.rawValue <= 0) return "";
        return metric === "sessions"
          ? formatInteger(datum.rawValue)
          : formatDurationCompact(datum.rawValue);
      },
      position: "top",
      rotate: 45,
      show: showLabels,
    },
    labelLayout: { hideOverlap: true },
    lineStyle: { color: colors[areaIndex % colors.length], width: 2 },
    name: labels[areaIndex],
    showSymbol: model.buckets.length <= 60,
    smooth: false,
    symbol: "circle",
    symbolSize: model.buckets.length > 32 ? 5 : 7,
    type: "line",
  }));
  const bottom = showZoom ? (areas.length > 1 ? 68 : 48) : areas.length > 1 ? 42 : 24;

  return {
    animation: false,
    backgroundColor: "transparent",
    color: colors,
    dataZoom: showZoom
      ? [
          {
            bottom: areas.length > 1 ? 28 : 8,
            brushSelect: false,
            end: 100,
            filterMode: "none",
            height: 10,
            showDetail: false,
            start: Math.max(0, 100 - (32 / model.buckets.length) * 100),
            type: "slider",
            xAxisIndex: 0,
          },
          {
            end: 100,
            filterMode: "none",
            start: Math.max(0, 100 - (32 / model.buckets.length) * 100),
            type: "inside",
            xAxisIndex: 0,
          },
        ]
      : undefined,
    grid: {
      bottom,
      containLabel: true,
      left: 8,
      right: 18,
      top: showLabels ? 30 : 12,
    },
    legend:
      areas.length > 1
        ? {
            bottom: 0,
            icon: "circle",
            itemHeight: 8,
            itemWidth: 8,
            pageTextStyle: { color: palette.legendText },
            textStyle: { color: palette.legendText, fontSize: 10 },
            type: "scroll",
          }
        : undefined,
    series,
    tooltip: {
      axisPointer: { type: "line" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (params: unknown) =>
        temporalLineTooltip(params, model, labels, metric),
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 9,
        hideOverlap: true,
        interval: "auto",
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { alignWithLabel: true },
      boundaryGap: false,
      data: model.buckets.map((bucket) => bucket.label),
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 9,
        formatter: (value: number) =>
          metric === "sessions"
            ? formatInteger(value)
            : formatDurationAxis(durationScale.fromAxis(value)),
      },
      axisLine: { show: false },
      min: 0,
      minInterval: metric === "sessions" ? 1 : undefined,
      name:
        metric === "sessions"
          ? "Sessões concluídas"
          : `${metric === "average" ? "Permanência média" : "Duração acumulada"}${durationScale.logarithmic ? " · escala log" : ""}`,
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } },
      type: "value",
    },
  };
}

export function buildOccupancyLoiteringPercentilesByAreaOption(
  model: OccupancyLoiteringTemporalModel,
  theme: ChartTheme = "light",
  widgetColor = "#0369A1",
  interactive = true,
): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const areas = model.areas.filter((area) => area.stats.count > 0);
  const labels = areaPresentationLabels(areas);
  const values = areas.flatMap((area) => [
    area.stats.medianDurationSeconds,
    area.stats.p90DurationSeconds,
  ]).filter((value): value is number => value !== null && value > 0);
  const scale = buildDurationScale(values);
  const showZoom = interactive && areas.length > 12;
  const data = (metric: "median" | "p90") =>
    areas.map((area, areaIndex) => {
      const rawValue = metric === "median"
        ? area.stats.medianDurationSeconds
        : area.stats.p90DurationSeconds;
      return {
        areaIndex,
        rawValue,
        value: rawValue === null ? null : scale.toAxis(rawValue),
      };
    });
  const series = [
    { color: widgetColor, data: data("median"), id: "loitering-median", name: "Mediana" },
    { color: "#7C3AED", data: data("p90"), id: "loitering-p90", name: "P90" },
  ].map((entry) => ({
    barMaxWidth: 18,
    data: entry.data,
    emphasis: { focus: "series" },
    id: entry.id,
    itemStyle: { borderRadius: [0, 4, 4, 0], color: entry.color },
    label: {
      color: palette.axisText,
      fontSize: 9,
      formatter: (params: unknown) => {
        const datum = areaMetricDatum(params);
        return datum?.rawValue && datum.rawValue > 0
          ? formatDurationCompact(datum.rawValue)
          : "";
      },
      position: "right",
      show: true,
    },
    labelLayout: { hideOverlap: true },
    name: entry.name,
    type: "bar",
  }));

  return {
    animation: false,
    backgroundColor: "transparent",
    dataZoom: showZoom
      ? [{
          bottom: 18,
          brushSelect: false,
          endValue: 11,
          filterMode: "filter",
          height: 9,
          showDetail: false,
          startValue: 0,
          type: "slider",
          yAxisIndex: 0,
        }]
      : undefined,
    grid: {
      bottom: showZoom ? 36 : 24,
      containLabel: true,
      left: 8,
      right: 76,
      top: 28,
    },
    legend: {
      icon: "roundRect",
      itemHeight: 7,
      itemWidth: 10,
      right: 4,
      textStyle: { color: palette.legendText, fontSize: 10 },
      top: 0,
    },
    series,
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (params: unknown) => {
        const candidates = chartParams(params);
        const areaIndex = candidates
          .map((candidate) => areaMetricDatum(candidate)?.areaIndex)
          .find((value): value is number => value !== undefined);
        const area = areaIndex === undefined ? undefined : areas[areaIndex];
        if (!area || areaIndex === undefined) return "";
        return [
          `<strong>${escapeHtml(labels[areaIndex])}</strong>`,
          `Mediana: <strong>${escapeHtml(formatAuditableDuration(area.stats.medianDurationSeconds))}</strong>`,
          `P90: <strong>${escapeHtml(formatAuditableDuration(area.stats.p90DurationSeconds))}</strong>`,
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 9,
        formatter: (value: number) => formatDurationAxis(scale.fromAxis(value)),
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      min: 0,
      name: `Duração${scale.logarithmic ? " · escala log" : ""}`,
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 10,
        overflow: "truncate",
        width: 126,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: labels,
      inverse: true,
      type: "category",
    },
  };
}

export function buildOccupancyLoiteringDurationDistributionOption(
  model: OccupancyLoiteringTemporalModel,
  theme: ChartTheme = "light",
  widgetColor = "#C2410C",
  interactive = true,
): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const areas = model.areas.filter((area) => area.stats.count > 0);
  const labels = areaPresentationLabels(areas);
  const colors = [widgetColor, ...SERIES_COLORS.filter((color) => color !== widgetColor)];
  const showLabels = areas.length <= 4;
  const showZoom = interactive && model.histogram.length > 10;
  const series = areas.map((area, areaIndex) => ({
    barMaxWidth: 44,
    data: area.histogram.map((bin, binIndex) => ({
      areaIndex,
      binIndex,
      count: bin.count,
      percentage: bin.percentage,
      value: bin.count,
    })),
    emphasis: { focus: "series" },
    id: `loitering-distribution-${areaIndex}`,
    itemStyle: { color: colors[areaIndex % colors.length] },
    label: {
      color: theme === "dark" ? "#F8FAFC" : "#13233A",
      fontSize: 9,
      formatter: (params: unknown) => {
        const datum = histogramDatum(params);
        return datum && datum.count > 0 ? formatInteger(datum.count) : "";
      },
      position: "inside",
      show: showLabels,
    },
    labelLayout: { hideOverlap: true },
    name: labels[areaIndex],
    stack: "sessões",
    type: "bar",
  }));

  return {
    animation: false,
    backgroundColor: "transparent",
    color: colors,
    dataZoom: showZoom
      ? [{
          bottom: areas.length > 1 ? 28 : 8,
          brushSelect: false,
          end: 100,
          filterMode: "none",
          height: 9,
          showDetail: false,
          start: 0,
          type: "slider",
          xAxisIndex: 0,
        }]
      : undefined,
    grid: {
      bottom: showZoom ? (areas.length > 1 ? 66 : 42) : areas.length > 1 ? 42 : 28,
      containLabel: true,
      left: 8,
      right: 12,
      top: 12,
    },
    legend:
      areas.length > 1
        ? {
            bottom: 0,
            icon: "roundRect",
            itemHeight: 7,
            itemWidth: 10,
            pageTextStyle: { color: palette.legendText },
            textStyle: { color: palette.legendText, fontSize: 10 },
            type: "scroll",
          }
        : undefined,
    series,
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (params: unknown) => {
        const candidates = chartParams(params);
        const binIndex = candidates
          .map((candidate) => histogramDatum(candidate)?.binIndex)
          .find((value): value is number => value !== undefined);
        if (binIndex === undefined) return "";
        const lines = [`<strong>${escapeHtml(model.histogram[binIndex]?.label ?? "Faixa")}</strong>`];
        candidates.forEach((candidate) => {
          const datum = histogramDatum(candidate);
          if (!datum || datum.count <= 0) return;
          lines.push(
            `${escapeHtml(labels[datum.areaIndex] ?? "Área")}: <strong>${formatInteger(datum.count)}</strong> · ${formatPercent(datum.percentage)}`,
          );
        });
        return lines.join("<br/>");
      },
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 9,
        hideOverlap: true,
        interval: 0,
        rotate: 45,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { alignWithLabel: true },
      data: model.histogram.map((bin) => bin.label),
      name: "Duração da sessão",
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: palette.axisText, fontSize: 9 },
      axisLine: { show: false },
      min: 0,
      minInterval: 1,
      name: "Sessões concluídas",
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } },
      type: "value",
    },
  };
}

export function buildOccupancyLoiteringAreaPeriodHeatmapOption(
  model: OccupancyLoiteringTemporalModel,
  theme: ChartTheme = "light",
  widgetColor = "#1267C4",
  interactive = true,
): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const stateColors = occupancyHeatmapStateColors(theme);
  const colors = monochromeHeatmapPalette(widgetColor, theme);
  const areas = model.areas.filter((area) => area.stats.count > 0);
  const labels = areaPresentationLabels(areas);
  const areaPositionByKey = new Map(
    areas.map((area, index) => [area.key, index]),
  );
  const cells = model.matrix.flatMap((cell) => {
    const areaPosition = areaPositionByKey.get(cell.areaKey);
    if (areaPosition === undefined) return [];
    return [{ ...cell, areaPosition }];
  });
  const sessionCells = cells.filter((cell) => cell.hasSessions);
  const scale = buildDurationScale(
    sessionCells.flatMap((cell) =>
      cell.avgDurationSeconds === null ? [] : [cell.avgDurationSeconds],
    ),
  );
  const maximum = Math.max(
    1,
    ...sessionCells.flatMap((cell) =>
      cell.avgDurationSeconds === null
        ? []
        : [scale.toAxis(cell.avgDurationSeconds)],
    ),
  );
  const showLabels = cells.length <= 120;
  const data = (hasSessions: boolean) =>
    cells
      .filter((cell) => cell.hasSessions === hasSessions)
      .map((cell) => {
        const rawValue = cell.avgDurationSeconds;
        return {
          areaIndex: cell.areaPosition,
          bucketIndex: cell.bucketIndex,
          count: cell.count,
          rawValue,
          value: [
            cell.bucketIndex,
            cell.areaPosition,
            rawValue === null ? -1 : scale.toAxis(rawValue),
          ],
        };
      });
  const baseSeries = {
    animation: false,
    coordinateSystem: "cartesian2d" as const,
    emphasis: {
      itemStyle: { borderColor: palette.axisText, borderWidth: 1.2 },
    },
    itemStyle: { borderColor: stateColors.outline, borderWidth: 0.6 },
    progressive: 0,
    type: "heatmap" as const,
  };
  const showHorizontalZoom = interactive && model.buckets.length > 32;
  const showVerticalZoom = interactive && areas.length > 12;

  return {
    animation: false,
    backgroundColor: "transparent",
    dataZoom: [
      ...(showHorizontalZoom
        ? [{
            bottom: 34,
            brushSelect: false,
            end: 100,
            filterMode: "filter" as const,
            height: 8,
            showDetail: false,
            start: Math.max(0, 100 - (32 / model.buckets.length) * 100),
            type: "slider" as const,
            xAxisIndex: 0,
          }]
        : []),
      ...(showVerticalZoom
        ? [{
            bottom: 58,
            endValue: 11,
            filterMode: "filter" as const,
            orient: "vertical" as const,
            right: 2,
            showDetail: false,
            startValue: 0,
            top: 8,
            type: "slider" as const,
            width: 8,
            yAxisIndex: 0,
          }]
        : []),
    ],
    grid: {
      bottom: 64,
      containLabel: true,
      left: 8,
      right: showVerticalZoom ? 22 : 8,
      top: 8,
    },
    series: [
      {
        ...baseSeries,
        data: data(false),
        id: "loitering-heatmap-no-sessions",
        itemStyle: {
          ...baseSeries.itemStyle,
          color: stateColors.noData,
        },
        label: { show: false },
        name: "Sem permanência concluída",
      },
      {
        ...baseSeries,
        data: data(true),
        id: "loitering-heatmap-average",
        label: {
          fontSize: 9,
          formatter: (params: unknown) => {
            const datum = heatmapDatum(params);
            if (datum?.rawValue === null || datum?.rawValue === undefined) {
              return "";
            }
            const axisValue = scale.toAxis(datum.rawValue);
            const tone =
              heatmapLabelColor(colors, axisValue / maximum) === "#FFFFFF"
                ? "strong"
                : "soft";
            return `{${tone}|${formatDurationCompact(datum.rawValue)}}`;
          },
          rich: {
            soft: {
              color: "#0F172A",
              fontSize: 9,
              fontWeight: 600,
            },
            strong: {
              color: "#FFFFFF",
              fontSize: 9,
              fontWeight: 600,
              textBorderColor: "rgba(15, 23, 42, 0.28)",
              textBorderWidth: 1,
            },
          },
          show: showLabels,
        },
        name: "Permanência média",
      },
    ],
    tooltip: {
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (params: unknown) => {
        const datum = heatmapDatum(params);
        if (!datum) return "";
        const area = areas[datum.areaIndex];
        const bucket = model.buckets[datum.bucketIndex];
        if (!area || !bucket) return "";
        const heading = `${labels[datum.areaIndex]} · ${bucket.label}`;
        return datum.rawValue === null
          ? `<strong>${escapeHtml(heading)}</strong><br/>Sem permanência concluída`
          : [
              `<strong>${escapeHtml(heading)}</strong>`,
              `Permanência média: <strong>${escapeHtml(formatAuditableDuration(datum.rawValue))}</strong>`,
            ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    visualMap: [
      {
        dimension: 2,
        pieces: [{ color: stateColors.noData, value: -1 }],
        seriesIndex: 0,
        show: false,
        type: "piecewise",
      },
      {
        bottom: showHorizontalZoom ? 45 : 30,
        calculable: false,
        dimension: 2,
        formatter: (value: number) => formatDurationAxis(scale.fromAxis(value)),
        inRange: { color: colors },
        itemHeight: 120,
        itemWidth: 8,
        left: "center",
        max: maximum,
        min: 0,
        orient: "horizontal",
        precision: 2,
        seriesIndex: 1,
        text: ["Maior", "Menor"],
        textGap: 6,
        textStyle: { color: palette.axisText, fontSize: 10 },
        type: "continuous",
      },
    ],
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 9,
        hideOverlap: true,
        interval: "auto",
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: model.buckets.map((bucket) => bucket.label),
      splitArea: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 9,
        overflow: "truncate",
        width: 126,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: labels,
      inverse: true,
      splitArea: { show: false },
      type: "category",
    },
  };
}

export function buildOccupancyLoiteringTemporalReportChart({
  contextLabel,
  dataContextLabel,
  kind,
  model,
  sessionsSlicedByDay = false,
  timeZone,
  widgetColor,
}: {
  contextLabel: string;
  dataContextLabel?: string;
  kind: OccupancyLoiteringTemporalCardId;
  model: OccupancyLoiteringTemporalModel;
  sessionsSlicedByDay?: boolean;
  timeZone: string;
  widgetColor?: string;
}): ReportChart | null {
  if (model.totals.count <= 0) return null;
  const configuration = temporalCardConfiguration(kind);
  const effectiveDataContext = dataContextLabel ?? contextLabel;
  const previewNote = sessionsSlicedByDay
    ? ` Esta visualização usa somente a prévia efetivamente carregada (${effectiveDataContext}), e não todo o período selecionado (${contextLabel}).`
    : ` Intervalo analisado: ${effectiveDataContext}.`;
  const semanticNote =
    " Cada permanência é agrupada pelo horário de encerramento, e sua duração integral pertence ao período de saída. A duração acumulada representa a soma das permanências e não o tempo cronológico em que a área esteve ocupada.";
  const description = `${configuration.reportDescription}.${previewNote}${semanticNote}`;
  return {
    description,
    fitOption: (option) => restoreTemporalExportValueLabels(option, kind),
    option: buildOccupancyLoiteringTemporalChartOption(
      kind,
      model,
      "light",
      widgetColor ?? DEFAULT_WIDGET_COLORS[kind],
      false,
    ),
    table: buildTemporalReportTable(kind, model, description, timeZone),
    title: configuration.title,
  };
}

export function buildOccupancyLoiteringTemporalReportAssets({
  contextLabel,
  dataContextLabel,
  model,
  sessionsSlicedByDay = false,
  timeZone,
  visibleCardIds = OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS,
  widgetColors,
}: {
  contextLabel: string;
  dataContextLabel?: string;
  model: OccupancyLoiteringTemporalModel;
  sessionsSlicedByDay?: boolean;
  timeZone: string;
  visibleCardIds?: readonly OccupancyLoiteringTemporalCardId[];
  widgetColors?: Partial<Record<OccupancyLoiteringTemporalCardId, string>>;
}): OccupancyLoiteringTemporalReportAsset[] {
  const visible = new Set(visibleCardIds);
  return OCCUPANCY_LOITERING_TEMPORAL_CARD_IDS.flatMap((cardId) => {
    if (!visible.has(cardId)) return [];
    const chart = buildOccupancyLoiteringTemporalReportChart({
      contextLabel,
      dataContextLabel,
      kind: cardId,
      model,
      sessionsSlicedByDay,
      timeZone,
      widgetColor: widgetColors?.[cardId],
    });
    return chart ? [{ cardId, chart }] : [];
  });
}

function buildTemporalReportTable(
  kind: OccupancyLoiteringTemporalCardId,
  model: OccupancyLoiteringTemporalModel,
  description: string,
  timeZone: string,
): ReportTable {
  const areas = model.areas.filter((area) => area.stats.count > 0);
  const labels = areaPresentationLabels(areas);
  if (kind === OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID) {
    return {
      columns: [
        { key: "scenario", label: "Cenário", width: 24 },
        { key: "area", label: "Área", width: 22 },
        { key: "median", label: "Mediana" },
        { key: "medianSeconds", label: "Mediana (s)", numeric: true },
        { key: "p90", label: "P90" },
        { key: "p90Seconds", label: "P90 (s)", numeric: true },
      ],
      description,
      rows: areas.map((area, index) => ({
        area: area.label,
        median: formatDuration(area.stats.medianDurationSeconds),
        medianSeconds: area.stats.medianDurationSeconds,
        p90: formatDuration(area.stats.p90DurationSeconds),
        p90Seconds: area.stats.p90DurationSeconds,
        scenario: scenarioLabel(area, labels[index]),
      })),
      title: `Dados - ${OCCUPANCY_LOITERING_TEMPORAL_LABELS[kind]}`,
    };
  }
  if (kind === OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID) {
    return {
      columns: [
        { key: "scenario", label: "Cenário", width: 24 },
        { key: "area", label: "Área", width: 22 },
        { key: "range", label: "Faixa de duração", width: 20 },
        { key: "sessions", label: "Sessões", numeric: true },
        { key: "percentage", label: "% da área", numeric: true },
        { key: "personTime", label: "Duração acumulada" },
        { key: "personTimeSeconds", label: "Duração acumulada (s)", numeric: true },
      ],
      description,
      rows: areas.flatMap((area, areaIndex) =>
        area.histogram.flatMap((bin) =>
          bin.count <= 0
            ? []
            : [{
                area: area.label,
                percentage: roundForReport(bin.percentage),
                personTime: formatDuration(bin.sumDurationSeconds),
                personTimeSeconds: bin.sumDurationSeconds,
                range: bin.label,
                scenario: scenarioLabel(area, labels[areaIndex]),
                sessions: bin.count,
              }],
        ),
      ),
      title: `Dados - ${OCCUPANCY_LOITERING_TEMPORAL_LABELS[kind]}`,
    };
  }
  const cumulative =
    kind === OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID;
  return {
    columns: [
      { key: "scenario", label: "Cenário", width: 22 },
      { key: "area", label: "Área", width: 20 },
      { key: "period", label: "Período", width: 30 },
      { key: "average", label: "Permanência média" },
      { key: "averageSeconds", label: "Média (s)", numeric: true },
      { key: "personTime", label: "Duração concluída" },
      { key: "personTimeSeconds", label: "Duração concluída (s)", numeric: true },
      ...(cumulative
        ? [
            { key: "accumulatedPersonTime", label: "Duração acumulada" },
            {
              key: "accumulatedPersonTimeSeconds",
              label: "Acumulado (s)",
              numeric: true,
            },
          ]
        : []),
    ],
    description,
    rows: areas.flatMap((area, areaIndex) => {
      let accumulatedPersonTimeSeconds = 0;
      return area.buckets.flatMap((bucket) => {
        accumulatedPersonTimeSeconds += bucket.sumDurationSeconds;
        if (!bucket.hasSessions) return [];
        const temporalBucket = model.buckets[bucket.bucketIndex];
        if (!temporalBucket) return [];
        return [{
          area: area.label,
          average: formatDuration(bucket.avgDurationSeconds),
          averageSeconds: bucket.avgDurationSeconds,
          period: `${formatDateTime(temporalBucket.from, timeZone)} – ${formatDateTime(temporalBucket.to, timeZone)}`,
          personTime: formatDuration(bucket.sumDurationSeconds),
          personTimeSeconds: bucket.sumDurationSeconds,
          scenario: scenarioLabel(area, labels[areaIndex]),
          ...(cumulative
            ? {
                accumulatedPersonTime: formatDuration(
                  accumulatedPersonTimeSeconds,
                ),
                accumulatedPersonTimeSeconds,
              }
            : {}),
        }];
      });
    }),
    title: `Dados - ${OCCUPANCY_LOITERING_TEMPORAL_LABELS[kind]}`,
  };
}

function temporalCardConfiguration(kind: OccupancyLoiteringTemporalCardId) {
  const title = OCCUPANCY_LOITERING_TEMPORAL_LABELS[kind];
  switch (kind) {
    case OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID:
      return {
        ariaDescription:
          "Quantidade de sessões de permanência concluídas em cada área ao longo do tempo.",
        icon: ChartNoAxesCombined,
        reportDescription:
          "Sessões de permanência concluídas em cada área ao longo do tempo",
        title,
      } as const;
    case OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID:
      return {
        ariaDescription:
          "Duração média das permanências concluídas em cada área ao longo do tempo.",
        icon: Clock3,
        reportDescription:
          "Permanência média concluída por área e período",
        title,
      } as const;
    case OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID:
      return {
        ariaDescription:
          "Soma acumulada das durações individuais concluídas, sem representar o tempo ocupado da área.",
        icon: Sigma,
        reportDescription:
          "Duração acumulada das permanências concluídas por área",
        title,
      } as const;
    case OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID:
      return {
        ariaDescription:
          "Mediana e percentil noventa da duração das permanências concluídas em cada área.",
        icon: ChartNoAxesCombined,
        reportDescription:
          "Mediana e percentil noventa das permanências concluídas por área",
        title,
      } as const;
    case OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID:
      return {
        ariaDescription:
          "Distribuição das sessões concluídas por faixa de duração e área.",
        icon: ChartNoAxesCombined,
        reportDescription:
          "Distribuição das sessões concluídas por faixa de duração e área",
        title,
      } as const;
    case OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID:
      return {
        ariaDescription:
          "Mapa de calor da permanência média concluída por área e período.",
        icon: Grid3X3,
        reportDescription:
          "Mapa de calor da permanência média concluída por área e período",
        title,
      } as const;
  }
}

function temporalDescription(
  kind: OccupancyLoiteringTemporalCardId,
  sessionsSlicedByDay: boolean,
  effectiveDataLabel: string,
) {
  const base =
    kind === OCCUPANCY_LOITERING_ACCUMULATED_SESSION_TIME_CARD_ID
      ? "Soma das durações individuais, sem equivaler ao tempo ocupado da área"
      : kind === OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID
        ? "Sessões concluídas agrupadas por faixa de duração"
        : kind === OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID
          ? "Duração típica e limite abaixo do qual estão 90% das permanências"
          : kind === OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID
            ? "Intensidade da permanência média concluída em cada área e período"
            : kind === OCCUPANCY_LOITERING_AVERAGE_OVER_TIME_CARD_ID
              ? "Média das permanências concluídas em cada período"
              : "Quantidade de sessões encerradas em cada período";
  return sessionsSlicedByDay
    ? `${base} · agrupado pela saída · prévia carregada: ${effectiveDataLabel}`
    : `${base} · agrupado pela saída · ${effectiveDataLabel}`;
}

/**
 * The shared exporter deliberately standardizes line/bar labels after the
 * report option is built. Duration charts may use a log1p axis, so restore the
 * human duration from each datum's auditable raw value while retaining the
 * exporter's density stride (represented by an empty inherited label).
 */
function restoreTemporalExportValueLabels(
  option: EnterpriseChartOption,
  kind: OccupancyLoiteringTemporalCardId,
): EnterpriseChartOption {
  const source = (option as { series?: unknown }).series;
  if (!source || kind === OCCUPANCY_LOITERING_AREA_PERIOD_HEATMAP_CARD_ID) {
    return option;
  }
  const restore = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return candidate;
    const series = candidate as Record<string, unknown>;
    if (series.type !== "line" && series.type !== "bar") return candidate;
    const label =
      series.label && typeof series.label === "object"
        ? (series.label as Record<string, unknown>)
        : {};
    if (label.show === false) return candidate;
    const inheritedFormatter =
      typeof label.formatter === "function"
        ? (label.formatter as (params: unknown) => unknown)
        : null;
    return {
      ...series,
      label: {
        ...label,
        formatter: (params: unknown) => {
          if (inheritedFormatter?.(params) === "") return "";
          if (kind === OCCUPANCY_LOITERING_DURATION_DISTRIBUTION_CARD_ID) {
            const datum = histogramDatum(params);
            return datum && datum.count > 0 ? formatInteger(datum.count) : "";
          }
          if (kind === OCCUPANCY_LOITERING_PERCENTILES_BY_AREA_CARD_ID) {
            const datum = areaMetricDatum(params);
            return datum?.rawValue !== null &&
              datum?.rawValue !== undefined &&
              datum.rawValue > 0
              ? formatDurationCompact(datum.rawValue)
              : "";
          }
          const datum = temporalDatum(params);
          if (
            !datum ||
            !datum.hasSessions ||
            datum.rawValue === null ||
            datum.rawValue <= 0
          ) {
            return "";
          }
          return kind === OCCUPANCY_LOITERING_SESSIONS_OVER_TIME_CARD_ID
            ? formatInteger(datum.rawValue)
            : formatDurationCompact(datum.rawValue);
        },
      },
    };
  };
  return {
    ...option,
    series: Array.isArray(source) ? source.map(restore) : restore(source),
  } as EnterpriseChartOption;
}

function temporalLineTooltip(
  params: unknown,
  model: OccupancyLoiteringTemporalModel,
  labels: readonly string[],
  metric: TemporalLineMetric,
) {
  const candidates = chartParams(params);
  const bucketIndex = candidates
    .map((candidate) => temporalDatum(candidate)?.bucketIndex)
    .find((value): value is number => value !== undefined);
  const bucket = bucketIndex === undefined ? undefined : model.buckets[bucketIndex];
  if (!bucket) return "";
  const lines = [`<strong>${escapeHtml(bucket.label)}</strong>`];
  candidates.forEach((candidate) => {
    const datum = temporalDatum(candidate);
    if (!datum || !datum.hasSessions || datum.rawValue === null) return;
    const label = labels[datum.areaIndex] ?? "Área";
    lines.push(
      metric === "sessions"
        ? `${escapeHtml(label)}: <strong>${formatInteger(datum.rawValue)}</strong> sessões concluídas`
        : `${escapeHtml(label)}: <strong>${escapeHtml(formatAuditableDuration(datum.rawValue))}</strong>`,
    );
  });
  if (lines.length === 1) lines.push("Nenhuma permanência concluída");
  if (metric === "accumulated") {
    lines.push("Soma das durações concluídas; não é tempo ocupado da área.");
  }
  return lines.join("<br/>");
}

function areaPresentationLabels(areas: readonly OccupancyLoiteringTemporalArea[]) {
  const bases = areas.map((area) => {
    const scenarios = area.scenarioLabels.join(" · ");
    return scenarios ? `${scenarios} · ${area.label}` : area.label;
  });
  const counts = new Map<string, number>();
  return bases.map((base) => {
    const next = (counts.get(base) ?? 0) + 1;
    counts.set(base, next);
    return next === 1 ? base : `${base} · ${next}`;
  });
}

function scenarioLabel(area: OccupancyLoiteringTemporalArea, fallback: string) {
  return area.scenarioLabels.length ? area.scenarioLabels.join(" · ") : fallback;
}

function buildDurationScale(values: readonly number[]): DurationScale {
  const finite = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  const maximum = finite.at(-1) ?? 0;
  const positives = finite.filter((value) => value > 0);
  const minimumPositive = positives[0] ?? maximum;
  const median = positives.length
    ? positives[Math.floor((positives.length - 1) / 2)]
    : maximum;
  const logarithmic =
    finite.length > 1 &&
    maximum >= 86_400 &&
    (maximum / Math.max(1, minimumPositive) >= 1_000 ||
      maximum / Math.max(1, median) >= 100 ||
      maximum >= 30 * 86_400);
  return logarithmic
    ? {
        fromAxis: (value) => Math.max(0, Math.expm1(value)),
        logarithmic: true,
        toAxis: (value) => Math.log1p(Math.max(0, value)),
      }
    : {
        fromAxis: (value) => value,
        logarithmic: false,
        toAxis: (value) => value,
      };
}

function temporalDataPeriodLabel(
  period: TemporalPeriodSource,
  timeZone: string,
  explicitLabel?: string,
) {
  if (explicitLabel?.trim()) return explicitLabel.trim();
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone,
    year: "numeric",
  });
  return `${formatter.format(period.from)} – ${formatter.format(period.to)}`;
}

function temporalDatum(value: unknown) {
  const candidate = chartCandidate(value);
  if (!candidate) return null;
  const data = candidate.data;
  if (!data || typeof data !== "object") return null;
  const datum = data as {
    areaIndex?: unknown;
    bucketIndex?: unknown;
    hasSessions?: unknown;
    rawValue?: unknown;
  };
  if (
    typeof datum.areaIndex !== "number" ||
    !Number.isInteger(datum.areaIndex) ||
    typeof datum.bucketIndex !== "number" ||
    !Number.isInteger(datum.bucketIndex) ||
    typeof datum.hasSessions !== "boolean" ||
    (datum.rawValue !== null &&
      (typeof datum.rawValue !== "number" || !Number.isFinite(datum.rawValue)))
  ) {
    return null;
  }
  return {
    areaIndex: datum.areaIndex,
    bucketIndex: datum.bucketIndex,
    hasSessions: datum.hasSessions,
    rawValue: datum.rawValue as number | null,
  };
}

function histogramDatum(value: unknown) {
  const candidate = chartCandidate(value);
  if (!candidate) return null;
  const data = candidate.data;
  if (!data || typeof data !== "object") return null;
  const datum = data as {
    areaIndex?: unknown;
    binIndex?: unknown;
    count?: unknown;
    percentage?: unknown;
  };
  if (
    typeof datum.areaIndex !== "number" ||
    !Number.isInteger(datum.areaIndex) ||
    typeof datum.binIndex !== "number" ||
    !Number.isInteger(datum.binIndex) ||
    typeof datum.count !== "number" ||
    !Number.isFinite(datum.count) ||
    typeof datum.percentage !== "number" ||
    !Number.isFinite(datum.percentage)
  ) {
    return null;
  }
  return datum as {
    areaIndex: number;
    binIndex: number;
    count: number;
    percentage: number;
  };
}

function areaMetricDatum(value: unknown) {
  const candidate = chartCandidate(value);
  if (!candidate) return null;
  const data = candidate.data;
  if (!data || typeof data !== "object") return null;
  const datum = data as {
    areaIndex?: unknown;
    rawValue?: unknown;
  };
  if (
    typeof datum.areaIndex !== "number" ||
    !Number.isInteger(datum.areaIndex) ||
    (datum.rawValue !== null &&
      (typeof datum.rawValue !== "number" || !Number.isFinite(datum.rawValue)))
  ) {
    return null;
  }
  return {
    areaIndex: datum.areaIndex,
    rawValue: datum.rawValue as number | null,
  };
}

function heatmapDatum(value: unknown) {
  const candidate = chartCandidate(value);
  if (!candidate) return null;
  const data = candidate.data;
  if (!data || typeof data !== "object") return null;
  const datum = data as {
    areaIndex?: unknown;
    bucketIndex?: unknown;
    count?: unknown;
    rawValue?: unknown;
  };
  if (
    typeof datum.areaIndex !== "number" ||
    !Number.isInteger(datum.areaIndex) ||
    typeof datum.bucketIndex !== "number" ||
    !Number.isInteger(datum.bucketIndex) ||
    typeof datum.count !== "number" ||
    !Number.isFinite(datum.count) ||
    (datum.rawValue !== null &&
      (typeof datum.rawValue !== "number" || !Number.isFinite(datum.rawValue)))
  ) {
    return null;
  }
  return {
    areaIndex: datum.areaIndex,
    bucketIndex: datum.bucketIndex,
    count: datum.count,
    rawValue: datum.rawValue as number | null,
  };
}

function chartParams(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function chartCandidate(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as { data?: unknown })
    : null;
}

function formatDuration(value: number | null) {
  return value === null ? "—" : formatOccupancyLoiteringDuration(value, true);
}

function formatAuditableDuration(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return "—";
  const raw = `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(value)} s`;
  return value >= 60
    ? `${formatOccupancyLoiteringDuration(value, true)} · ${raw}`
    : raw;
}

function formatDurationAxis(value: number) {
  if (!Number.isFinite(value) || value < 0) return "";
  const formatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  });
  if (value < 60) return `${formatter.format(value)} s`;
  if (value < 3_600) return `${formatter.format(value / 60)} min`;
  if (value < 86_400) return `${formatter.format(value / 3_600)} h`;
  if (value < 365 * 86_400) return `${formatter.format(value / 86_400)} d`;
  return `${formatter.format(value / (365 * 86_400))} a`;
}

function formatDurationCompact(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 60) return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}s`;
  if (value < 3_600) return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 60)}min`;
  if (value < 86_400) return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 3_600)}h`;
  if (value < 365 * 86_400) return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 86_400)}d`;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / (365 * 86_400))}a`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function roundForReport(value: number) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
