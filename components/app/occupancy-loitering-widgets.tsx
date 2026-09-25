"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  shiftOccupancyCompanyDay,
} from "@/lib/occupancy-calendar";
import {
  occupancyLoiteringKey,
  type OccupancyLoiteringSessionRow,
  type OccupancyLoiteringSummaryModel,
} from "@/lib/occupancy-loitering";
import {
  fetchOccupancyLoiteringSessions,
  initialOccupancyLoiteringSessionDay,
  occupancyLoiteringSessionsQueryRange,
} from "@/lib/occupancy-loitering-query";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import type { ReportChart, ReportTable } from "@/lib/report-export";
import { formatDateTime } from "@/lib/utils";

export const OCCUPANCY_LOITERING_CARD_ID =
  "occupancy_loitering_summary" as const;
// This is the combined occupancy-duration summary card. It consumes
// `/loitering/summary` only for the explicitly labelled individual dwell
// metric; occupied/free state and duration remain detection-derived.
export const OCCUPANCY_DURATION_AVERAGE_CARD_ID =
  "occupancy_duration_average" as const;
export const OCCUPANCY_LOITERING_SESSION_COUNT_CARD_ID =
  "occupancy_loitering_session_count_by_area" as const;
export const OCCUPANCY_LOITERING_MINIMUM_CARD_ID =
  "occupancy_loitering_minimum_by_area" as const;
export const OCCUPANCY_LOITERING_MAXIMUM_CARD_ID =
  "occupancy_loitering_maximum_by_area" as const;
export const OCCUPANCY_LOITERING_RANGE_CARD_ID =
  "occupancy_loitering_range_by_area" as const;

/** Cards backed by the single tenant-wide `/loitering/summary` response. */
export const OCCUPANCY_LOITERING_SUMMARY_CARD_IDS = [
  OCCUPANCY_LOITERING_MINIMUM_CARD_ID,
  OCCUPANCY_LOITERING_MAXIMUM_CARD_ID,
  OCCUPANCY_LOITERING_RANGE_CARD_ID,
] as const;

/**
 * Every widget that needs the tenant-wide `/loitering/summary` dataset.
 * The duration summary owns its own visual card, but shares this transport.
 */
export const OCCUPANCY_LOITERING_SUMMARY_CONSUMER_CARD_IDS = [
  OCCUPANCY_DURATION_AVERAGE_CARD_ID,
  ...OCCUPANCY_LOITERING_SUMMARY_CARD_IDS,
] as const;

/** Every card in this family, including the sessions endpoint consumer. */
export const OCCUPANCY_LOITERING_CARD_IDS = [
  OCCUPANCY_LOITERING_CARD_ID,
  ...OCCUPANCY_LOITERING_SUMMARY_CARD_IDS,
] as const;

export type OccupancyLoiteringPeriod = {
  contextLabel: string;
  from: Date;
  to: Date;
};

export type LoiteringChartEntry = {
  areaLabel?: string;
  average: number;
  label: string;
  maximum: number;
  minimum: number;
  scenarioLabel?: string;
  sessions: number;
};

export type OccupancyLoiteringSummaryMetric =
  | "average"
  | "maximum"
  | "minimum"
  | "sessions";

type DurationScale = {
  fromAxis: (value: number) => number;
  logarithmic: boolean;
  toAxis: (value: number) => number;
};

const MAX_LOITERING_SESSION_CHART_POINTS = 240;
const LOITERING_SESSION_COLORS = [
  "#0F766E",
  "#7C3AED",
  "#C2410C",
  "#0369A1",
  "#A16207",
  "#BE123C",
  "#15803D",
  "#4F46E5",
] as const;

export type OccupancyLoiteringSessionEntry = {
  areaLabel: string;
  durationSeconds: number;
  endedAt: string;
  key: string;
  scenarioLabel: string;
};

/**
 * Presents the raw completed sessions without collapsing them into another
 * average. One physical area may belong to more than one selected scenario;
 * in that case the shared context is stated once instead of duplicating the
 * same backend session in the list.
 */
export function occupancyLoiteringSessionEntries(
  model: OccupancyLoiteringSummaryModel,
  sessions: readonly OccupancyLoiteringSessionRow[],
): OccupancyLoiteringSessionEntry[] {
  const contextByArea = new Map<
    string,
    { areaLabel: string; scenarioLabels: Set<string> }
  >();
  model.scenarios.forEach((scenario) => {
    scenario.areas.forEach((area) => {
      const current = contextByArea.get(area.key);
      if (current) {
        current.scenarioLabels.add(scenario.label);
        return;
      }
      contextByArea.set(area.key, {
        areaLabel: area.label,
        scenarioLabels: new Set([scenario.label]),
      });
    });
  });

  return sessions.flatMap((session, index) => {
    const areaKey = occupancyLoiteringKey(
      session.camera_id,
      session.area,
      session.object_class,
    );
    const context = contextByArea.get(areaKey);
    if (!context) return [];
    return [{
      areaLabel: context.areaLabel,
      durationSeconds: session.duration_seconds,
      endedAt: session.ended_at,
      key: JSON.stringify([
        session.camera_id,
        session.area,
        session.object_class,
        session.ended_at,
        session.duration_seconds,
        index,
      ]),
      scenarioLabel: Array.from(context.scenarioLabels).join(" · "),
    }];
  });
}

/**
 * Plots every supplied completed session as one point. The x-axis is the
 * certified exit instant and the y-axis is that session's exact duration;
 * rows sharing the same timestamp are deliberately retained.
 */
export function buildOccupancyLoiteringSessionsChartOption(
  entries: readonly OccupancyLoiteringSessionEntry[],
  theme: "dark" | "light",
  widgetColor = "#1267C4",
  timeZone = "UTC",
): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const ordered = entries
    .map((entry, index) => ({
      entry,
      index,
      timestamp: Date.parse(entry.endedAt),
    }))
    .filter(
      (candidate) =>
        Number.isFinite(candidate.timestamp) &&
        Number.isFinite(candidate.entry.durationSeconds),
    )
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp || left.index - right.index,
    );
  const grouped = new Map<
    string,
    Array<(typeof ordered)[number]>
  >();
  ordered.forEach((candidate) => {
    const groupLabel = `${candidate.entry.scenarioLabel} · ${candidate.entry.areaLabel}`;
    const current = grouped.get(groupLabel) ?? [];
    current.push(candidate);
    grouped.set(groupLabel, current);
  });

  const durationScale = buildDurationScale(
    ordered.map(({ entry }) => entry.durationSeconds),
  );

  const firstTimestamp = ordered[0]?.timestamp ?? 0;
  const lastTimestamp = ordered.at(-1)?.timestamp ?? firstTimestamp;
  const spansMultipleDays = lastTimestamp - firstTimestamp >= 36 * 60 * 60_000;
  const axisFormatter = new Intl.DateTimeFormat("pt-BR", {
    ...(spansMultipleDays
      ? { day: "2-digit", month: "short" }
      : { hour: "2-digit", minute: "2-digit" }),
    timeZone,
  });
  const showLabels = ordered.length <= 16;
  const showZoom = ordered.length > 40;
  const showLegend = grouped.size > 1;
  const colors = [widgetColor, ...LOITERING_SESSION_COLORS];
  const series = Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
    .map(([seriesLabel, points], index) => ({
    data: points.map(({ entry, timestamp }) => ({
      areaLabel: entry.areaLabel,
      durationSeconds: entry.durationSeconds,
      endedAt: entry.endedAt,
      scenarioLabel: entry.scenarioLabel,
      value: [timestamp, durationScale.toAxis(entry.durationSeconds)],
    })),
    emphasis: { focus: "series", scale: 1.35 },
    id: `loitering-session-${index}`,
    itemStyle: {
      borderColor: palette.surface,
      borderWidth: 1.5,
      color: colors[index % colors.length],
      opacity: 0.88,
    },
    label: {
      color: palette.axisText,
      formatter: (raw: unknown) => {
        const data = chartSessionDatum(raw);
        return data
          ? formatHumanDuration(data.durationSeconds, true)
          : "";
      },
      fontSize: 9,
      fontWeight: 600,
      position: "top",
      show: showLabels,
    },
    labelLayout: { hideOverlap: true },
    name: seriesLabel,
    symbol: "circle",
    symbolSize: ordered.length > 120 ? 7 : ordered.length > 40 ? 8 : 10,
      type: "scatter",
    }));

  return {
    animation: false,
    backgroundColor: "transparent",
    dataZoom: showZoom
      ? [
          {
            bottom: showLegend ? 24 : 5,
            brushSelect: false,
            end: 100,
            filterMode: "none",
            height: 10,
            showDetail: false,
            start: 0,
            type: "slider",
            xAxisIndex: 0,
          },
          {
            end: 100,
            filterMode: "none",
            start: 0,
            type: "inside",
            xAxisIndex: 0,
          },
        ]
      : undefined,
    grid: {
      bottom: showZoom ? (showLegend ? 62 : 42) : showLegend ? 42 : 28,
      containLabel: true,
      left: 8,
      right: 18,
      top: showLabels ? 26 : 12,
    },
    legend: showLegend
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
      axisPointer: { type: "cross" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (raw: unknown) => {
        const data = chartSessionDatum(raw);
        if (!data) return "";
        return [
          `<strong>${escapeHtml(data.scenarioLabel)}</strong>`,
          `Área: ${escapeHtml(data.areaLabel)}`,
          `Permanência: <strong>${escapeHtml(formatAuditableDuration(data.durationSeconds))}</strong>`,
          `Saída: ${escapeHtml(formatDateTime(data.endedAt, timeZone))}`,
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) => axisFormatter.format(value),
        fontSize: 9,
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisPointer: { label: { formatter: ({ value }: { value: number }) => axisFormatter.format(value) } },
      boundaryGap: ["2%", "2%"],
      name: "Horário de saída",
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } },
      type: "time",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) =>
          formatAxisDuration(durationScale.fromAxis(value)),
        fontSize: 9,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      min: 0,
      name: durationScale.logarithmic
        ? "Duração · escala log adaptativa"
        : "Duração",
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } },
      type: "value",
    },
  };
}

export function OccupancyLoiteringAverageByScenarioCard({
  error,
  loading,
  model,
  monitorMode,
}: OccupancyLoiteringSummaryCardProps) {
  return (
    <OccupancyLoiteringSummaryMetricCard
      error={error}
      loading={loading}
      metric="average"
      model={model}
      monitorMode={monitorMode}
    />
  );
}

export type OccupancyLoiteringSummaryCardProps = {
  error?: string;
  loading: boolean;
  model: OccupancyLoiteringSummaryModel;
  monitorMode: boolean;
};

export function OccupancyLoiteringSummaryMetricCard({
  error,
  loading,
  metric,
  model,
  monitorMode,
}: OccupancyLoiteringSummaryCardProps & {
  metric: OccupancyLoiteringSummaryMetric;
}) {
  const { effectiveTheme } = useTheme();
  const configuration = loiteringMetricConfiguration(metric);
  const widgetColor = useWidgetColor(configuration.color);
  const entries = React.useMemo(
    () => occupancyLoiteringChartEntries(model),
    [model],
  );
  const option = React.useMemo(
    () =>
      entries.length
        ? buildOccupancyLoiteringSummaryMetricChartOption(
            entries,
            effectiveTheme === "dark" ? "dark" : "light",
            metric,
            widgetColor,
          )
        : null,
    [effectiveTheme, entries, metric, widgetColor],
  );

  return (
    <Card
      className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-monitor-mode={monitorMode || undefined}
      data-occupancy-loitering-average={metric === "average" || undefined}
      data-occupancy-loitering-metric={metric}
    >
      <CardHeader className="min-w-0 gap-1 p-3 pb-1">
        <CardTitle className="flex min-w-0 items-start gap-2">
          <Clock3
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: widgetColor }}
          />
          <WidgetTitleText fallback={configuration.title} />
        </CardTitle>
        <CardDescription className="line-clamp-2 text-xs leading-4">
          {configuration.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-3 pt-1">
        {error ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground"
            role="status"
          >
            {error}
          </div>
        ) : loading && !entries.length ? (
          <Skeleton className="min-h-28 w-full flex-1" />
        ) : !option ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground">
            Nenhum registro de permanência foi concluído neste período.
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
      </CardContent>
    </Card>
  );
}

export function OccupancyLoiteringRangeCard({
  error,
  loading,
  model,
  monitorMode,
}: OccupancyLoiteringSummaryCardProps) {
  const { effectiveTheme } = useTheme();
  const widgetColor = useWidgetColor("#1267C4");
  const entries = React.useMemo(
    () => occupancyLoiteringChartEntries(model),
    [model],
  );
  const option = React.useMemo(
    () =>
      entries.length
        ? buildOccupancyLoiteringChartOption(
            entries,
            effectiveTheme === "dark" ? "dark" : "light",
            widgetColor,
          )
        : null,
    [effectiveTheme, entries, widgetColor],
  );

  return (
    <Card
      className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-monitor-mode={monitorMode || undefined}
      data-occupancy-loitering-range
    >
      <CardHeader className="min-w-0 gap-1 p-3 pb-1">
        <CardTitle className="flex min-w-0 items-start gap-2">
          <Clock3
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: widgetColor }}
          />
          <WidgetTitleText fallback="Faixa de permanência por área" />
        </CardTitle>
        <CardDescription className="line-clamp-2 text-xs leading-4">
          Menor, média e maior duração das permanências concluídas em cada área física
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-3 pt-1">
        {error ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground"
            role="status"
          >
            {error}
          </div>
        ) : loading && !entries.length ? (
          <Skeleton className="min-h-28 w-full flex-1" />
        ) : !option ? (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground">
            Nenhum registro de permanência foi concluído neste período.
          </div>
        ) : (
          <div
            aria-busy={loading}
            className="min-h-28 min-w-0 flex-1"
            data-echart-layout="natural"
          >
            <EChart
              ariaDescription="Faixa entre a menor e a maior permanência concluída, com a média destacada, por área física."
              ariaLabel="Faixa de permanência por área"
              className="h-full min-h-0 w-full"
              option={option}
              themeMode="explicit"
              valueLabels="always"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OccupancyLoiteringSummaryCard({
  companyScopeId,
  error,
  loading,
  model,
  monitorMode,
  period,
  previewPeriod,
  sessions,
  sessionsSlicedByDay,
  timeZone,
}: {
  companyScopeId: string;
  error?: string;
  loading: boolean;
  model: OccupancyLoiteringSummaryModel;
  monitorMode: boolean;
  period: OccupancyLoiteringPeriod;
  previewPeriod: Pick<OccupancyLoiteringPeriod, "from" | "to"> | null;
  sessions: readonly OccupancyLoiteringSessionRow[];
  sessionsSlicedByDay: boolean;
  timeZone: string;
}) {
  const { effectiveTheme } = useTheme();
  const widgetColor = useWidgetColor("#1267C4");
  const sessionEntries = React.useMemo(
    () => occupancyLoiteringSessionEntries(model, sessions),
    [model, sessions],
  );
  const chartEntries = React.useMemo(
    () => sessionEntries.slice(0, MAX_LOITERING_SESSION_CHART_POINTS),
    [sessionEntries],
  );
  const chartOption = React.useMemo(
    () =>
      chartEntries.length
        ? buildOccupancyLoiteringSessionsChartOption(
            chartEntries,
            effectiveTheme === "dark" ? "dark" : "light",
            widgetColor,
            timeZone,
          )
        : null,
    [chartEntries, effectiveTheme, timeZone, widgetColor],
  );
  const [sessionsOpen, setSessionsOpen] = React.useState(false);
  const [sessionsPeriod, setSessionsPeriod] = React.useState(period);
  const hasConfiguredAreas = model.areas.length > 0;
  const previewContext =
    sessionsSlicedByDay && previewPeriod
      ? formatCivilDay(previewPeriod.from, timeZone)
      : period.contextLabel;

  return (
    <>
      <Card
        className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        data-occupancy-loitering-sessions
        data-occupancy-loitering-summary
      >
        <CardHeader className="min-w-0 gap-1 p-3 pb-1">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0">
              <CardTitle className="flex min-w-0 items-start gap-2">
                <Clock3
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: widgetColor }}
                />
                <WidgetTitleText fallback="Permanências registradas" />
              </CardTitle>
              <CardDescription
                className="mt-0.5 line-clamp-2 text-xs leading-4"
                title={`Registros de permanência concluídos em ${previewContext}.`}
              >
                Duração e horário de saída · {previewContext}
              </CardDescription>
            </div>
            {!monitorMode ? (
              <Button
                aria-label="Consultar registros individuais de permanência"
                className="h-8 shrink-0 px-2.5"
                disabled={!hasConfiguredAreas}
                onClick={() => {
                  setSessionsPeriod(period);
                  setSessionsOpen(true);
                }}
                size="sm"
                title="Ver todos os registros individuais"
                type="button"
                variant="outline"
              >
                <ListChecks className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap text-[11px]">Ver todas</span>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3 pt-1">
          {error ? (
            <div
              className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground"
              role="status"
            >
              {error}
            </div>
          ) : loading && !chartEntries.length ? (
            <Skeleton className="min-h-40 w-full flex-1" />
          ) : !hasConfiguredAreas ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground">
              Este cenário não possui áreas de permanência vinculadas.
            </div>
          ) : !chartOption ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-muted/15 px-3 text-center text-xs text-muted-foreground">
              Nenhum registro de permanência foi concluído {sessionsSlicedByDay ? "neste dia" : "neste período"}.
            </div>
          ) : (
            <div
              aria-busy={loading}
              className="min-h-40 min-w-0 flex-1"
              data-echart-layout="natural"
            >
              <EChart
                ariaDescription="Cada ponto representa um registro concluído, posicionado pelo horário de saída e pela duração da permanência."
                ariaLabel="Permanências registradas ao longo do tempo"
                className="h-full min-h-0 w-full"
                option={chartOption}
                themeMode="explicit"
                valueLabels={chartEntries.length <= 16 ? "auto" : "none"}
              />
            </div>
          )}
          {sessionEntries.length ? (
            <div className="shrink-0 text-[11px] text-muted-foreground">
              Registros mais recentes{sessionsSlicedByDay ? " · prévia diária" : ""}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <OccupancyLoiteringSessionsDialog
        companyScopeId={companyScopeId}
        model={model}
        onOpenChange={setSessionsOpen}
        open={sessionsOpen}
        period={sessionsPeriod}
        timeZone={timeZone}
      />
    </>
  );
}

function OccupancyLoiteringSessionsDialog({
  companyScopeId,
  model,
  onOpenChange,
  open,
  period,
  timeZone,
}: {
  companyScopeId: string;
  model: OccupancyLoiteringSummaryModel;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  period: OccupancyLoiteringPeriod;
  timeZone: string;
}) {
  const areas = model.areas;
  const expectedAreas = React.useMemo(
    () =>
      areas.map((area) => ({
        area: area.area,
        cameraId: area.cameraId,
        objectClass: area.objectClass,
      })),
    [areas],
  );
  const [areaIndex, setAreaIndex] = React.useState(0);
  const [dayStart, setDayStart] = React.useState(() =>
    initialOccupancyLoiteringSessionDay({
      from: period.from,
      timeZone,
      to: period.to,
    }),
  );
  const [page, setPage] = React.useState(0);
  const [state, setState] = React.useState<{
    error?: string;
    loading: boolean;
    rows: OccupancyLoiteringSessionRow[];
    scopeKey: string;
  }>({ loading: false, rows: [], scopeKey: "" });
  const selectedArea = areas[Math.min(areaIndex, Math.max(0, areas.length - 1))];
  const selectedAreaKey = selectedArea?.key ?? "";
  const sessionQueryRange = React.useMemo(
    () =>
      occupancyLoiteringSessionsQueryRange({
        dayStart,
        from: period.from,
        timeZone,
        to: period.to,
      }),
    [dayStart, period, timeZone],
  );
  const scopeKey = sessionQueryRange
    ? JSON.stringify([
        companyScopeId,
        sessionQueryRange.from.getTime(),
        sessionQueryRange.to.getTime(),
        timeZone,
      ])
    : "";

  React.useEffect(() => {
    if (!open) return;
    setAreaIndex((current) => Math.min(current, Math.max(0, areas.length - 1)));
    setDayStart(
      initialOccupancyLoiteringSessionDay({
        from: period.from,
        timeZone,
        to: period.to,
      }),
    );
    setPage(0);
  }, [areas.length, open, period, timeZone]);

  React.useEffect(() => {
    if (
      !open ||
      !sessionQueryRange ||
      !scopeKey
    ) {
      return;
    }
    const controller = new AbortController();
    setState((current) =>
      current.scopeKey === scopeKey
        ? { ...current, error: undefined, loading: true }
        : { loading: true, rows: [], scopeKey },
    );
    void fetchOccupancyLoiteringSessions({
      companyScopeId,
      expectedAreas,
      from: sessionQueryRange.from,
      signal: controller.signal,
      timeZone,
      to: sessionQueryRange.to,
    })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setState({
          loading: false,
          rows,
          scopeKey,
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error, controller.signal)) return;
        setState({
          error: "Não foi possível carregar as sessões deste dia.",
          loading: false,
          rows: [],
          scopeKey,
        });
      });
    return () => abortRequest(controller);
  }, [
    companyScopeId,
    expectedAreas,
    open,
    sessionQueryRange,
    scopeKey,
    timeZone,
  ]);

  const current = state.scopeKey === scopeKey
    ? state
    : { loading: true, rows: [], scopeKey };
  const selectedRows = React.useMemo(
    () =>
      selectedAreaKey
        ? current.rows.filter(
            (row) =>
              occupancyLoiteringKey(
                row.camera_id,
                row.area,
                row.object_class,
              ) === selectedAreaKey,
          )
        : [],
    [current.rows, selectedAreaKey],
  );
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(selectedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = selectedRows.slice(
    safePage * pageSize,
    (safePage + 1) * pageSize,
  );
  const canGoPreviousDay = Boolean(
    sessionQueryRange?.slicedByDay &&
      sessionQueryRange.from.getTime() > period.from.getTime(),
  );
  const canGoNextDay = Boolean(
    sessionQueryRange?.slicedByDay &&
      sessionQueryRange.to.getTime() < period.to.getTime(),
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="grid max-h-[92dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Permanências individuais</DialogTitle>
          <DialogDescription>
            Uma linha por permanência concluída. Registros com o mesmo horário são
            preservados e podem representar saídas simultâneas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Área</div>
            <Select
              disabled={!areas.length}
              onValueChange={(value) => {
                setAreaIndex(Number(value));
                setPage(0);
              }}
              value={areas.length ? String(Math.min(areaIndex, areas.length - 1)) : undefined}
            >
              <SelectTrigger className="min-w-0 w-full">
                <SelectValue placeholder="Nenhuma área disponível" />
              </SelectTrigger>
              <SelectContent>
                {areas.map((area, index) => (
                  <SelectItem key={area.key} value={String(index)}>
                    {area.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sessionQueryRange?.slicedByDay ? (
            <div className="flex min-w-0 items-center justify-between gap-1 rounded-md border p-1 sm:justify-end">
              <Button
                aria-label="Dia anterior"
                disabled={!canGoPreviousDay}
                onClick={() => {
                  setDayStart((currentDay) =>
                    shiftOccupancyCompanyDay(currentDay, -1, timeZone),
                  );
                  setPage(0);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-28 text-center text-xs font-semibold tabular-nums">
                {formatCivilDay(sessionQueryRange.from, timeZone)}
              </span>
              <Button
                aria-label="Próximo dia"
                disabled={!canGoNextDay}
                onClick={() => {
                  setDayStart((currentDay) =>
                    shiftOccupancyCompanyDay(currentDay, 1, timeZone),
                  );
                  setPage(0);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex h-10 min-w-0 items-center justify-center rounded-md border px-3 text-xs font-medium text-muted-foreground">
              Período selecionado
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-auto rounded-md border">
          {current.loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton className="h-9 w-full" key={index} />
              ))}
            </div>
          ) : current.error ? (
            <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground" role="status">
              {current.error}
            </div>
          ) : !selectedRows.length ? (
            <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Nenhuma permanência concluída nesta área e neste período.
            </div>
          ) : (
            <Table scrollRegionLabel="Permanências do período">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Encerrada em</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row, index) => (
                  <TableRow
                    key={`${row.ended_at}|${row.duration_seconds}|${safePage * pageSize + index}`}
                  >
                    <TableCell className="tabular-nums">
                      {formatDateTime(row.ended_at, timeZone)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatAuditableDuration(row.duration_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs tabular-nums text-muted-foreground">
            Página {safePage + 1} de {pageCount}
          </span>
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={safePage === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Anterior
            </Button>
            <Button
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Próxima
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function occupancyLoiteringChartEntries(
  model: OccupancyLoiteringSummaryModel,
): LoiteringChartEntry[] {
  if (model.areas.length) {
    const scenarioLabelsByArea = new Map<string, Set<string>>();
    model.scenarios.forEach((scenario) => {
      scenario.areas.forEach((area) => {
        const labels = scenarioLabelsByArea.get(area.key) ?? new Set<string>();
        labels.add(scenario.label);
        scenarioLabelsByArea.set(area.key, labels);
      });
    });

    return model.areas
      .flatMap((area) => {
        const row = area.summary;
        if (!row || row.session_count <= 0) return [];
        const scenarioLabel = Array.from(
          scenarioLabelsByArea.get(area.key) ?? [],
        ).join(" · ") || "Cenário";
        return [{
          areaLabel: area.label,
          average: row.avg_duration_seconds,
          label: `${scenarioLabel} · ${area.label}`,
          maximum: row.max_duration_seconds,
          minimum: row.min_duration_seconds,
          scenarioLabel,
          sessions: row.session_count,
        }];
      })
      .sort(
        (left, right) =>
          right.average - left.average ||
          left.label.localeCompare(right.label, "pt-BR"),
      );
  }

  // Compatibility for synthetic fixtures created before physical areas were
  // included in the normalized model. Production models use the branch above.
  return model.scenarios
    .flatMap((scenario) =>
      scenario.totals.sessionCount > 0 &&
      scenario.totals.avgDurationSeconds !== null &&
      scenario.totals.minDurationSeconds !== null &&
      scenario.totals.maxDurationSeconds !== null
        ? [{
            areaLabel: scenario.label,
            average: scenario.totals.avgDurationSeconds,
            label: scenario.label,
            maximum: scenario.totals.maxDurationSeconds,
            minimum: scenario.totals.minDurationSeconds,
            scenarioLabel: scenario.label,
            sessions: scenario.totals.sessionCount,
          }]
        : [],
    )
    .sort(
      (left, right) =>
        right.average - left.average ||
        left.label.localeCompare(right.label, "pt-BR"),
    );
}

export function buildOccupancyLoiteringChartOption(
  entries: readonly LoiteringChartEntry[],
  theme: "dark" | "light",
  widgetColor = "#1267C4",
): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const rangeColor = theme === "dark" ? "#52657E" : "#BCCADC";
  const scrollScenarios = entries.length > 8;
  const durationScale = buildDurationScale(
    entries.flatMap((entry) => [entry.minimum, entry.average, entry.maximum]),
  );
  const averageLabel = (params: unknown) => {
    const index = chartDataIndex(params);
    const entry = index === null ? undefined : entries[index];
    if (!entry) return "";
    return formatHumanDuration(entry.average);
  };
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: {
      bottom: 30,
      containLabel: true,
      left: 8,
      right: 90,
      top: 10,
    },
    series: [
      {
        data: entries.map((entry, index) => ({
          averageSeconds: entry.average,
          maximumSeconds: entry.maximum,
          minimumSeconds: entry.minimum,
          name: entry.label,
          value: [
            durationScale.toAxis(entry.minimum),
            durationScale.toAxis(entry.maximum),
            durationScale.toAxis(entry.average),
            index,
          ],
        })),
        encode: { x: [0, 1, 2], y: 3 },
        id: "loitering-range",
        itemStyle: { color: rangeColor },
        name: "Intervalo observado",
        renderItem: loiteringRangeRenderItem(rangeColor),
        silent: true,
        type: "custom",
      },
      {
        data: entries.map((entry, index) => [
          durationScale.toAxis(entry.average),
          index,
        ]),
        id: "loitering-average",
        itemStyle: {
          borderColor: palette.surface,
          borderWidth: 2,
          color: widgetColor,
        },
        label: {
          color: palette.axisText,
          formatter: (params: unknown) => averageLabel(params),
          fontSize: 10,
          position: "right",
          show: true,
        },
        name: "Média",
        symbolSize: 10,
        type: "scatter",
      },
    ],
    ...(scrollScenarios
      ? {
          dataZoom: [
            {
              brushSelect: false,
              endValue: 7,
              filterMode: "weakFilter",
              right: 4,
              showDetail: false,
              startValue: 0,
              type: "slider",
              width: 9,
              yAxisIndex: 0,
            },
            {
              endValue: 7,
              filterMode: "weakFilter",
              startValue: 0,
              type: "inside",
              yAxisIndex: 0,
            },
          ],
        }
      : {}),
    tooltip: {
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (params: unknown) => {
        const index = chartDataIndex(params);
        const entry = index === null ? undefined : entries[index];
        if (!entry) return "";
        return [
          `<strong>${escapeHtml(entry.label)}</strong>`,
          `Média: <strong>${escapeHtml(formatAuditableDuration(entry.average))}</strong>`,
          `Menor: ${escapeHtml(formatAuditableDuration(entry.minimum))}`,
          `Maior: ${escapeHtml(formatAuditableDuration(entry.maximum))}`,
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) =>
          formatAxisDuration(durationScale.fromAxis(value)),
        fontSize: 10,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      min: 0,
      name: durationScale.logarithmic
        ? "Tempo · escala log adaptativa"
        : "Tempo",
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 10,
        overflow: "truncate",
        width: 124,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: entries.map((entry) => entry.label),
      inverse: true,
      type: "category",
    },
    media: [
      {
        option: {
          grid: { left: 4, right: scrollScenarios ? 82 : 70 },
          series: [
            { id: "loitering-range" },
            {
              id: "loitering-average",
              label: {
                formatter: (params: unknown) => averageLabel(params),
                fontSize: 9,
              },
            },
          ],
          yAxis: { axisLabel: { fontSize: 9, width: 76 } },
        },
        query: { maxWidth: 520 },
      },
      {
        option: {
          grid: { bottom: 22, top: 4 },
          xAxis: { axisLabel: { fontSize: 9 }, name: "" },
          yAxis: { axisLabel: { fontSize: 9 } },
        },
        query: { maxHeight: 250 },
      },
    ],
  };
}

export function buildOccupancyLoiteringSummaryMetricChartOption(
  entries: readonly LoiteringChartEntry[],
  theme: "dark" | "light",
  metric: OccupancyLoiteringSummaryMetric,
  widgetColor = "#0F766E",
  interactive = true,
): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const configuration = loiteringMetricConfiguration(metric);
  const orderedEntries = [...entries].sort((left, right) => {
    const difference = loiteringMetricValue(right, metric) -
      loiteringMetricValue(left, metric);
    return difference || left.label.localeCompare(right.label, "pt-BR");
  });
  const scrollScenarios = interactive && orderedEntries.length > 8;
  const durationScale = metric === "sessions"
    ? identityDurationScale()
    : buildDurationScale(
        orderedEntries.map((entry) => loiteringMetricValue(entry, metric)),
      );
  const entryFromParams = (params: unknown) => {
    const index = chartDataIndex(params);
    return index === null ? undefined : orderedEntries[index];
  };

  return {
    animation: interactive,
    backgroundColor: "transparent",
    dataZoom: scrollScenarios
      ? [
          {
            brushSelect: false,
            endValue: 7,
            filterMode: "weakFilter",
            right: 4,
            showDetail: false,
            startValue: 0,
            type: "slider",
            width: 9,
            yAxisIndex: 0,
          },
          {
            endValue: 7,
            filterMode: "weakFilter",
            startValue: 0,
            type: "inside",
            yAxisIndex: 0,
          },
        ]
      : undefined,
    grid: {
      bottom: 30,
      containLabel: true,
      left: 8,
      right: scrollScenarios ? 96 : 84,
      top: 10,
    },
    series: [
      {
        barMaxWidth: 28,
        data: orderedEntries.map((entry) => ({
          rawValue: loiteringMetricValue(entry, metric),
          value: durationScale.toAxis(loiteringMetricValue(entry, metric)),
        })),
        emphasis: { focus: "self" },
        itemStyle: {
          borderRadius: [0, 5, 5, 0],
          color: widgetColor,
        },
        label: {
          color: palette.axisText,
          formatter: (params: unknown) => {
            const entry = entryFromParams(params);
            if (!entry) return "";
            const value = loiteringMetricValue(entry, metric);
            return metric === "sessions"
              ? value.toLocaleString("pt-BR")
              : formatHumanDuration(value, true);
          },
          fontSize: 10,
          fontWeight: 600,
          position: "right",
          show: true,
        },
        labelLayout: { hideOverlap: false },
        name: configuration.seriesName,
        type: "bar",
      },
    ],
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: palette.tooltipBackground,
      borderColor: palette.tooltipBorder,
      confine: true,
      formatter: (raw: unknown) => {
        const entry = entryFromParams(raw);
        if (!entry) return "";
        return [
          `<strong>${escapeHtml(entry.label)}</strong>`,
          `${configuration.valueLabel}: <strong>${metric === "sessions"
            ? entry.sessions.toLocaleString("pt-BR")
            : escapeHtml(formatAuditableDuration(loiteringMetricValue(entry, metric)))}</strong>`,
          `Média: ${escapeHtml(formatAuditableDuration(entry.average))}`,
          `Menor: ${escapeHtml(formatAuditableDuration(entry.minimum))}`,
          `Maior: ${escapeHtml(formatAuditableDuration(entry.maximum))}`,
        ].join("<br/>");
      },
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) =>
          metric === "sessions"
            ? new Intl.NumberFormat("pt-BR", {
                maximumFractionDigits: 0,
              }).format(value)
            : formatAxisDuration(durationScale.fromAxis(value)),
        fontSize: 10,
      },
      axisLine: { lineStyle: { color: palette.axisLine } },
      min: 0,
      name: durationScale.logarithmic
        ? `${configuration.axisName} · escala log adaptativa`
        : configuration.axisName,
      nameTextStyle: { color: palette.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } },
      type: "value",
    },
    yAxis: {
      axisLabel: {
        color: palette.axisText,
        fontSize: 10,
        overflow: "truncate",
        width: 140,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      data: orderedEntries.map((entry) => entry.label),
      inverse: true,
      type: "category",
    },
    media: [
      {
        option: {
          grid: { left: 4, right: scrollScenarios ? 84 : 72 },
          series: [{ label: { fontSize: 9 }, name: configuration.seriesName }],
          yAxis: { axisLabel: { fontSize: 9, width: 84 } },
        },
        query: { maxWidth: 520 },
      },
      {
        option: {
          grid: { bottom: 22, top: 4 },
          xAxis: { axisLabel: { fontSize: 9 }, name: "" },
          yAxis: { axisLabel: { fontSize: 9 } },
        },
        query: { maxHeight: 250 },
      },
    ],
  };
}

export function buildOccupancyLoiteringAverageChartOption(
  entries: readonly LoiteringChartEntry[],
  theme: "dark" | "light",
  widgetColor = "#0F766E",
  interactive = true,
): EnterpriseChartOption {
  return buildOccupancyLoiteringSummaryMetricChartOption(
    entries,
    theme,
    "average",
    widgetColor,
    interactive,
  );
}

export function buildOccupancyLoiteringReport(
  model: OccupancyLoiteringSummaryModel,
  sessions: readonly OccupancyLoiteringSessionRow[],
  contextLabel: string,
  timeZone: string,
  widgetColor?: string,
): ReportChart | null {
  const entries = occupancyLoiteringSessionEntries(model, sessions);
  if (!entries.length) return null;
  const chartEntries = entries.slice(0, MAX_LOITERING_SESSION_CHART_POINTS);
  const description = [
    `Registros individuais de permanência concluídos em ${contextLabel}. Cada ponto apresenta quando o registro terminou e sua duração.`,
    entries.length > chartEntries.length
      ? "O gráfico prioriza os registros mais recentes; a tabela preserva todo o período carregado."
      : "",
  ].filter(Boolean).join(" ");
  const table: ReportTable = {
    columns: [
      { key: "scenario", label: "Cenário", width: 26 },
      { key: "area", label: "Área", width: 24 },
      { key: "endedAt", label: "Horário de saída", width: 28 },
      { key: "duration", label: "Permanência", width: 18 },
      {
        key: "durationSeconds",
        label: "Segundos brutos",
        numeric: true,
        width: 16,
      },
    ],
    description,
    rows: entries.map((entry) => ({
      area: entry.areaLabel,
      duration: formatHumanDuration(entry.durationSeconds, true),
      durationSeconds: entry.durationSeconds,
      endedAt: formatDateTime(entry.endedAt, timeZone),
      scenario: entry.scenarioLabel,
    })),
    title: "Dados - Permanências registradas",
  };
  return {
    description,
    option: buildOccupancyLoiteringSessionsChartOption(
      chartEntries,
      "light",
      widgetColor,
      timeZone,
    ),
    table,
    title: "Permanências registradas",
  };
}

export function buildOccupancyLoiteringAverageReport(
  model: OccupancyLoiteringSummaryModel,
  contextLabel: string,
  widgetColor?: string,
): ReportChart | null {
  return buildOccupancyLoiteringSummaryMetricReport(
    model,
    contextLabel,
    "average",
    widgetColor,
  );
}

export function buildOccupancyLoiteringSummaryMetricReport(
  model: OccupancyLoiteringSummaryModel,
  contextLabel: string,
  metric: OccupancyLoiteringSummaryMetric,
  widgetColor?: string,
): ReportChart | null {
  const entries = occupancyLoiteringChartEntries(model);
  if (!entries.length) return null;
  const configuration = loiteringMetricConfiguration(metric);
  const description = `${configuration.reportDescription} em ${contextLabel}. Cada área física aparece uma única vez, ainda que seja compartilhada por mais de um cenário.`;
  const table: ReportTable = {
    columns: [
      { key: "scenario", label: "Cenário", width: 22 },
      { key: "area", label: "Área", width: 20 },
      { key: "average", label: "Média" },
      { key: "averageSeconds", label: "Média (s)", numeric: true },
      { key: "minimum", label: "Menor" },
      { key: "minimumSeconds", label: "Menor (s)", numeric: true },
      { key: "maximum", label: "Maior" },
      { key: "maximumSeconds", label: "Maior (s)", numeric: true },
    ],
    description,
    rows: entries.map((entry) => ({
      area: loiteringEntryAreaLabel(entry),
      average: formatHumanDuration(entry.average, true),
      averageSeconds: entry.average,
      maximum: formatHumanDuration(entry.maximum, true),
      maximumSeconds: entry.maximum,
      minimum: formatHumanDuration(entry.minimum, true),
      minimumSeconds: entry.minimum,
      scenario: loiteringEntryScenarioLabel(entry),
    })),
    title: `Dados - ${configuration.title}`,
  };
  return {
    description,
    option: buildOccupancyLoiteringSummaryMetricChartOption(
      entries,
      "light",
      metric,
      widgetColor,
      false,
    ),
    table,
    title: configuration.title,
  };
}

export function buildOccupancyLoiteringSessionCountReport(
  model: OccupancyLoiteringSummaryModel,
  contextLabel: string,
  widgetColor?: string,
) {
  return buildOccupancyLoiteringSummaryMetricReport(
    model,
    contextLabel,
    "sessions",
    widgetColor,
  );
}

export function buildOccupancyLoiteringMinimumReport(
  model: OccupancyLoiteringSummaryModel,
  contextLabel: string,
  widgetColor?: string,
) {
  return buildOccupancyLoiteringSummaryMetricReport(
    model,
    contextLabel,
    "minimum",
    widgetColor,
  );
}

export function buildOccupancyLoiteringMaximumReport(
  model: OccupancyLoiteringSummaryModel,
  contextLabel: string,
  widgetColor?: string,
) {
  return buildOccupancyLoiteringSummaryMetricReport(
    model,
    contextLabel,
    "maximum",
    widgetColor,
  );
}

export function buildOccupancyLoiteringRangeReport(
  model: OccupancyLoiteringSummaryModel,
  contextLabel: string,
  widgetColor?: string,
): ReportChart | null {
  const entries = occupancyLoiteringChartEntries(model);
  if (!entries.length) return null;
  const description = `Faixa entre a menor e a maior permanência, com a média destacada, em ${contextLabel}. Cada área física aparece uma única vez.`;
  const table: ReportTable = {
    columns: [
      { key: "scenario", label: "Cenário", width: 22 },
      { key: "area", label: "Área", width: 20 },
      { key: "minimum", label: "Menor" },
      { key: "minimumSeconds", label: "Menor (s)", numeric: true },
      { key: "average", label: "Média" },
      { key: "averageSeconds", label: "Média (s)", numeric: true },
      { key: "maximum", label: "Maior" },
      { key: "maximumSeconds", label: "Maior (s)", numeric: true },
    ],
    description,
    rows: entries.map((entry) => ({
      area: loiteringEntryAreaLabel(entry),
      average: formatHumanDuration(entry.average, true),
      averageSeconds: entry.average,
      maximum: formatHumanDuration(entry.maximum, true),
      maximumSeconds: entry.maximum,
      minimum: formatHumanDuration(entry.minimum, true),
      minimumSeconds: entry.minimum,
      scenario: loiteringEntryScenarioLabel(entry),
    })),
    title: "Dados - Faixa de permanência por área",
  };
  return {
    description,
    option: buildOccupancyLoiteringChartOption(entries, "light", widgetColor),
    table,
    title: "Faixa de permanência por área",
  };
}

function loiteringMetricConfiguration(
  metric: OccupancyLoiteringSummaryMetric,
) {
  switch (metric) {
    case "average":
      return {
        ariaDescription:
          "Permanência média dos registros concluídos em cada área física.",
        axisName: "Permanência média",
        color: "#0F766E",
        description:
          "Tempo médio das permanências concluídas, separado por cenário e área",
        reportDescription:
          "Permanência média dos registros concluídos por cenário e área",
        seriesName: "Permanência média",
        title: "Permanência média por área",
        valueLabel: "Permanência média",
      } as const;
    case "minimum":
      return {
        ariaDescription:
          "Menor permanência concluída observada em cada área física.",
        axisName: "Menor permanência",
        color: "#0369A1",
        description:
          "Menor duração concluída observada em cada cenário e área",
        reportDescription:
          "Menor permanência concluída por cenário e área",
        seriesName: "Menor permanência",
        title: "Menor permanência por área",
        valueLabel: "Menor permanência",
      } as const;
    case "maximum":
      return {
        ariaDescription:
          "Maior permanência concluída observada em cada área física.",
        axisName: "Maior permanência",
        color: "#C2410C",
        description:
          "Maior duração concluída observada em cada cenário e área",
        reportDescription:
          "Maior permanência concluída por cenário e área",
        seriesName: "Maior permanência",
        title: "Maior permanência por área",
        valueLabel: "Maior permanência",
      } as const;
    case "sessions":
      return {
        ariaDescription:
          "Quantidade de sessões concluídas em cada área física.",
        axisName: "Sessões concluídas",
        color: "#7C3AED",
        description:
          "Quantidade de permanências encerradas por cenário e área",
        reportDescription:
          "Quantidade de sessões de permanência concluídas por cenário e área",
        seriesName: "Sessões concluídas",
        title: "Sessões concluídas por área",
        valueLabel: "Sessões concluídas",
      } as const;
  }
}

function loiteringEntryAreaLabel(entry: LoiteringChartEntry) {
  return entry.areaLabel ?? entry.label;
}

function loiteringEntryScenarioLabel(entry: LoiteringChartEntry) {
  return entry.scenarioLabel ?? entry.label;
}

function loiteringMetricValue(
  entry: LoiteringChartEntry,
  metric: OccupancyLoiteringSummaryMetric,
) {
  switch (metric) {
    case "average":
      return entry.average;
    case "maximum":
      return entry.maximum;
    case "minimum":
      return entry.minimum;
    case "sessions":
      return entry.sessions;
  }
}

function identityDurationScale(): DurationScale {
  return {
    fromAxis: (value) => value,
    logarithmic: false,
    toAxis: (value) => value,
  };
}

/**
 * `log1p` keeps an exact zero on the origin while making a very long session
 * coexist with ordinary sessions. Raw seconds remain attached to every datum
 * and are always used by labels, tooltips and exported tables.
 */
export function buildOccupancyLoiteringDurationScale(
  values: readonly number[],
): DurationScale {
  return buildDurationScale(values);
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
  const hasZero = finite.some((value) => value === 0);
  const ratioToMinimum = minimumPositive > 0
    ? maximum / minimumPositive
    : 1;
  const ratioToMedian = median > 0 ? maximum / median : 1;
  const logarithmic =
    finite.length > 1 &&
    maximum >= 86_400 &&
    (
      ratioToMinimum >= 1_000 ||
      ratioToMedian >= 100 ||
      (hasZero && maximum >= 30 * 86_400) ||
      (maximum >= 365 * 86_400 && ratioToMedian >= 10)
    );

  return logarithmic
    ? {
        fromAxis: (value) => Math.max(0, Math.expm1(value)),
        logarithmic: true,
        toAxis: (value) => Math.log1p(Math.max(0, value)),
      }
    : identityDurationScale();
}

function formatHumanDuration(value: number, precise = false) {
  if (!Number.isFinite(value) || value < 0) return "—";
  const secondFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: precise ? 3 : 1,
  });
  if (value < 60) return `${secondFormatter.format(value)} s`;

  const wholeSeconds = Math.floor(value);
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;
  const year = 365 * day;
  if (value < hour) {
    const minutes = Math.floor(wholeSeconds / minute);
    const seconds = value - minutes * minute;
    return seconds > 0
      ? `${minutes} min ${secondFormatter.format(seconds)} s`
      : `${minutes} min`;
  }
  if (value < day) {
    const hours = Math.floor(wholeSeconds / hour);
    const minutes = Math.floor((wholeSeconds % hour) / minute);
    return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  if (value < year) {
    const days = Math.floor(wholeSeconds / day);
    const hours = Math.floor((wholeSeconds % day) / hour);
    return hours ? `${days} d ${hours} h` : `${days} d`;
  }
  const years = Math.floor(wholeSeconds / year);
  const days = Math.floor((wholeSeconds % year) / day);
  return days
    ? `${years} ${years === 1 ? "ano" : "anos"} ${days} d`
    : `${years} ${years === 1 ? "ano" : "anos"}`;
}

function formatAuditableDuration(value: number) {
  const raw = `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
  }).format(value)} s`;
  return value >= 60 ? `${formatHumanDuration(value, true)} · ${raw}` : raw;
}

function loiteringRangeRenderItem(color: string) {
  return (
    _params: unknown,
    api: {
      coord: (value: [number, number]) => [number, number];
      size: (value: [number, number]) => [number, number];
      value: (dimension: number) => unknown;
    },
  ) => {
    const minimum = numericValue(api.value(0));
    const maximum = numericValue(api.value(1));
    const category = numericValue(api.value(3));
    if (minimum === null || maximum === null || category === null) return null;
    const start = api.coord([minimum, category]);
    const end = api.coord([maximum, category]);
    const radius = Math.max(2.5, Math.min(4, Math.abs(api.size([0, 1])[1]) * 0.08));
    return {
      children: [
        {
          shape: { x1: start[0], x2: end[0], y1: start[1], y2: end[1] },
          style: { lineCap: "round", lineWidth: 3, opacity: 0.85, stroke: color },
          type: "line",
        },
        {
          shape: { cx: start[0], cy: start[1], r: radius },
          style: { fill: color },
          type: "circle",
        },
        {
          shape: { cx: end[0], cy: end[1], r: radius },
          style: { fill: color },
          type: "circle",
        },
      ],
      type: "group",
    };
  };
}

function formatCivilDay(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone,
    year: "numeric",
  }).format(value);
}

function chartDataIndex(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const index = (candidate as { dataIndex?: unknown }).dataIndex;
  return typeof index === "number" && Number.isInteger(index) ? index : null;
}

function chartSessionDatum(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const data = (candidate as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const session = data as {
    areaLabel?: unknown;
    durationSeconds?: unknown;
    endedAt?: unknown;
    scenarioLabel?: unknown;
  };
  if (
    typeof session.areaLabel !== "string" ||
    typeof session.durationSeconds !== "number" ||
    !Number.isFinite(session.durationSeconds) ||
    typeof session.endedAt !== "string" ||
    typeof session.scenarioLabel !== "string"
  ) {
    return null;
  }
  return {
    areaLabel: session.areaLabel,
    durationSeconds: session.durationSeconds,
    endedAt: session.endedAt,
    scenarioLabel: session.scenarioLabel,
  };
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatAxisDuration(value: number) {
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
