"use client";

import * as React from "react";
import { ChartNoAxesCombined, Grid3X3 } from "lucide-react";

import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
import { getOccupancyChartPalette, type OccupancyChartTheme } from "@/components/app/occupancy-chart-palette";
import { useTheme } from "@/components/app/theme-provider";
import { WidgetTitleText, useWidgetColor } from "@/components/app/widget-appearance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { monochromeHeatmapPalette } from "@/lib/chart-palette";
import { formatOccupancyDuration } from "@/lib/occupancy-duration";
import {
  buildOccupancyDurationInsightModel,
  type OccupancyDurationInsightMonth,
  type OccupancyDurationInsightScenario,
} from "@/lib/occupancy-duration-insights";
import type { ReportChart, ReportTable } from "@/lib/report-export";
import { cn } from "@/lib/utils";

export const OCCUPANCY_DURATION_INSIGHT_CARD_IDS = [
  "occupancy_duration_month_heatmap",
  "occupancy_duration_scenario_heatmap",
  "occupancy_duration_week_heatmap",
  "occupancy_duration_daily_profile",
] as const;

export type OccupancyDurationInsightCardId =
  (typeof OCCUPANCY_DURATION_INSIGHT_CARD_IDS)[number];

export const OCCUPANCY_DURATION_INSIGHT_LABELS: Record<OccupancyDurationInsightCardId, string> = {
  occupancy_duration_month_heatmap: "Tempo ocupado · dias e horários",
  occupancy_duration_scenario_heatmap: "Tempo ocupado · cenários e horários",
  occupancy_duration_week_heatmap: "Tempo ocupado · perfil semanal",
  occupancy_duration_daily_profile: "Tempo ocupado · evolução diária",
};

type InsightModel = ReturnType<typeof buildOccupancyDurationInsightModel>;
type InsightCell = InsightModel["dayHours"][number];
type InsightDuration = Pick<InsightCell, "confirmedOccupiedSeconds" | "confirmedFreeSeconds" | "transitionSeconds" | "unknownSeconds" | "expectedSeconds">;
type InsightOptionInput = {
  kind: OccupancyDurationInsightCardId;
  model: InsightModel;
  month: OccupancyDurationInsightMonth;
  scenarioNames: string[];
  theme: OccupancyChartTheme;
  widgetColor?: string;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}h`);
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const PERCENT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const STATE_LABELS = ["Ocupado confirmado", "Transição", "Livre confirmado", "Sem dados"];
const STATE_KEYS = ["confirmedOccupiedSeconds", "transitionSeconds", "confirmedFreeSeconds", "unknownSeconds"] as const;

export function OccupancyDurationInsightCard({
  kind,
  series,
  month,
  loading,
  error,
  monitorMode = false,
}: {
  kind: OccupancyDurationInsightCardId;
  series: OccupancyDurationInsightScenario[];
  month: OccupancyDurationInsightMonth | null;
  loading: boolean;
  error?: string;
  monitorMode?: boolean;
}) {
  const { effectiveTheme } = useTheme();
  const widgetColor = useWidgetColor("#1267C4");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [compact, setCompact] = React.useState(false);
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = () => {
      const next = root.getBoundingClientRect().height < 290;
      setCompact((current) => current === next ? current : next);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const model = React.useMemo(
    () => month ? buildOccupancyDurationInsightModel(series, month) : null,
    [month, series],
  );
  const option = React.useMemo(
    () => month && model ? buildOccupancyDurationInsightOption({
      kind, model, month, scenarioNames: series.map((item) => item.name), theme: effectiveTheme, widgetColor,
    }) : null,
    [effectiveTheme, kind, model, month, series, widgetColor],
  );
  const title = OCCUPANCY_DURATION_INSIGHT_LABELS[kind];
  const description = describeInsight(kind, series.length);
  const partial = series.some((item) => item.error);
  const message = error || (partial ? "Alguns cenários estão sem dados neste período." : undefined);
  const initialLoading = loading && !series.some((item) => item.hours.length > 0 || item.error);
  const heatmap = kind !== "occupancy_duration_daily_profile";
  const Icon = heatmap ? Grid3X3 : ChartNoAxesCombined;

  return (
    <Card ref={rootRef} className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden" data-occupancy-duration-insight={kind}>
      <CardHeader className={cn("min-w-0 gap-0.5", compact ? "p-2 pb-0.5" : "p-3 pb-1")}>
        <CardTitle className={cn("flex min-w-0 items-start gap-2", compact && "text-sm leading-5")}>
          <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: widgetColor }} />
          <WidgetTitleText fallback={title} />
        </CardTitle>
        <CardDescription className={cn("min-w-0 text-xs leading-4", compact ? "sr-only" : "line-clamp-1 @sm:line-clamp-2")} title={description}>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", compact ? "gap-0.5 p-2 pt-0" : "gap-1 p-3 pt-0")}>
        {message ? <p role="status" className="line-clamp-1 shrink-0 text-xs text-muted-foreground" title={message}>{message}</p> : null}
        {initialLoading ? <Skeleton className="min-h-0 w-full flex-1" /> : !option || !series.length ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-xs text-muted-foreground">
            {loading ? "Carregando permanência…" : "Selecione ao menos um cenário para visualizar a permanência."}
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1" data-echart-layout="natural" aria-busy={loading}>
            <EChart ariaLabel={title} ariaDescription={description} className="h-full min-h-0 w-full" option={option} themeMode="explicit" valueLabels="always" />
          </div>
        )}
        {!compact && !monitorMode && series.length > 0 ? (
          <p className="shrink-0 truncate text-[10px] leading-4 text-muted-foreground" title="Tempo em que cada cenário esteve ocupado. Não representa o tempo individual de permanência de uma pessoa ou veículo.">
            Tempo por cenário · detalhes ao passar o mouse
          </p>
        ) : null}
        {model && !loading ? (
          <ul className="sr-only" aria-label={`${title}: valores por dia`}>
            {model.days.filter((day) => day.expectedSeconds > 0).map((day) => (
              <li key={day.dateKey}>{formatDateKey(day.dateKey)}: {formatPercent(day.confirmedOccupiedSeconds, day.expectedSeconds)} ocupado confirmado, {formatOccupancyDuration(day.confirmedOccupiedSeconds)}; {formatOccupancyDuration(day.unknownSeconds)} sem dados.</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function buildOccupancyDurationInsightOption(input: InsightOptionInput): EnterpriseChartOption {
  return input.kind === "occupancy_duration_daily_profile"
    ? buildDailyProfileOption(input)
    : buildHeatmapOption(input);
}

function buildHeatmapOption({ kind, model, month, scenarioNames, theme, widgetColor = "#1267C4" }: InsightOptionInput): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const scenarioView = kind === "occupancy_duration_scenario_heatmap";
  const weekView = kind === "occupancy_duration_week_heatmap";
  const cells = scenarioView ? model.scenarioHours : weekView ? model.weekHours : model.dayHours;
  const colors = insightColors(theme, widgetColor);
  const scrollScenarios = scenarioView && scenarioNames.length > 12;
  const xLabels = scenarioView ? HOURS : weekView ? WEEKDAYS : month.dateKeys.map((date) => date.slice(-2));
  const yLabels = scenarioView ? scenarioNames : HOURS;
  const cellData = cells.map((cell, cellIndex) => ({
    cellIndex,
    value: [cell.x, cell.y, percent(cell.confirmedOccupiedSeconds, cell.expectedSeconds)],
  }));
  const confirmed = (cell: InsightCell) => cell.confirmedOccupiedSeconds + cell.confirmedFreeSeconds > 0;
  const tooltipFormatter = (params: unknown) => {
    const data = record(record(Array.isArray(params) ? params[0] : params).data);
    const cell = typeof data.cellIndex === "number" ? cells[data.cellIndex] : undefined;
    if (!cell) return "";
    const heading = scenarioView
      ? `${scenarioNames[cell.y] ?? "Cenário"} · ${HOURS[cell.x]}`
      : weekView ? `${WEEKDAYS[cell.x]} · ${HOURS[cell.y]}` : `${formatDateKey(month.dateKeys[cell.x] ?? "")} · ${HOURS[cell.y]}`;
    return durationTooltip(heading, cell, scenarioView ? 1 : scenarioNames.length);
  };
  const baseSeries = {
    type: "heatmap" as const,
    coordinateSystem: "cartesian2d" as const,
    progressive: 0,
    animation: false,
    itemStyle: { borderColor: colors.outline, borderWidth: 0.6 },
    label: { show: false },
    emphasis: { disabled: false, itemStyle: { borderColor: palette.axisText, borderWidth: 1 } },
  };
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { top: 8, right: scrollScenarios ? 24 : 8, bottom: 59, left: 8, containLabel: true },
    tooltip: { trigger: "item", confine: true, backgroundColor: palette.tooltipBackground, borderColor: palette.tooltipBorder, textStyle: { color: palette.tooltipText, fontSize: 12 }, formatter: tooltipFormatter },
    xAxis: { type: "category", data: xLabels, splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: palette.axisText, fontSize: 10, interval: 0, showMinLabel: true, showMaxLabel: true } },
    yAxis: { type: "category", data: yLabels, inverse: true, splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: palette.axisText, fontSize: 10, interval: "auto", hideOverlap: true, width: scenarioView ? 116 : 38, overflow: "truncate", showMinLabel: true, showMaxLabel: true } },
    visualMap: [
      { id: "duration-intensity", type: "continuous", min: 0, max: 100, dimension: 2, seriesIndex: [0], orient: "horizontal", left: "center", bottom: 22, itemHeight: 104, itemWidth: 7, text: ["100%", "0%"], textGap: 6, calculable: false, inRange: { color: colors.heat }, textStyle: { color: palette.axisText, fontSize: 10 }, precision: 0 },
      ...[colors.unknown, colors.future, colors.transition].map((color, index) => ({ id: `duration-state-${index}`, type: "continuous", show: false, min: 0, max: 100, dimension: 2, seriesIndex: [index + 1], inRange: { color: [color, color] } })),
    ],
    legend: { bottom: 0, left: "center", icon: "roundRect", selectedMode: false, itemWidth: 9, itemHeight: 7, itemGap: 12, textStyle: { color: palette.legendText, fontSize: 10 }, data: ["Transição", "Sem dados", "Ainda não decorrido"] },
    ...(scrollScenarios ? { dataZoom: [{ type: "slider", yAxisIndex: 0, orient: "vertical", startValue: 0, endValue: 11, right: 2, top: 8, bottom: 59, width: 8, showDetail: false, brushSelect: false, filterMode: "filter", borderColor: "transparent", backgroundColor: colors.future, fillerColor: colors.unknown, handleSize: "100%" }] } : {}),
    series: [
      { ...baseSeries, name: "Ocupado confirmado", data: cellData.filter((data) => cells[data.cellIndex].expectedSeconds > 0 && confirmed(cells[data.cellIndex])) },
      { ...baseSeries, name: "Sem dados", itemStyle: { ...baseSeries.itemStyle, color: colors.unknown }, data: cellData.filter((data) => cells[data.cellIndex].expectedSeconds > 0 && !confirmed(cells[data.cellIndex]) && cells[data.cellIndex].transitionSeconds <= 0) },
      { ...baseSeries, name: "Ainda não decorrido", itemStyle: { ...baseSeries.itemStyle, color: colors.future }, data: cellData.filter((data) => cells[data.cellIndex].expectedSeconds <= 0) },
      { ...baseSeries, name: "Transição", itemStyle: { ...baseSeries.itemStyle, color: colors.transition }, data: cellData.filter((data) => cells[data.cellIndex].expectedSeconds > 0 && !confirmed(cells[data.cellIndex]) && cells[data.cellIndex].transitionSeconds > 0) },
    ],
    media: [
      { query: { maxWidth: 760 }, option: { xAxis: { axisLabel: { interval: scenarioView ? (index: number) => index % 3 === 0 || index === 23 : 0 } } } },
      { query: { maxWidth: 460 }, option: { yAxis: { axisLabel: { width: scenarioView ? 75 : 32, fontSize: 9 } }, xAxis: { axisLabel: { fontSize: 9, interval: weekView ? 0 : (index: number) => index === xLabels.length - 1 || (index % 4 === 0 && index < xLabels.length - 2) } } } },
      { query: { maxHeight: 240 }, option: { grid: { top: 4, bottom: 50 }, yAxis: { axisLabel: { interval: scenarioView ? "auto" : (index: number) => index % 4 === 0 || index === 23, fontSize: 9 } }, visualMap: [{ id: "duration-intensity", itemHeight: 80, bottom: 18 }], legend: { textStyle: { fontSize: 9 }, itemGap: 8 }, ...(scrollScenarios ? { dataZoom: [{ endValue: 5, bottom: 50 }] } : {}) } },
    ],
  };
}

function buildDailyProfileOption({ model, scenarioNames, theme, widgetColor = "#1267C4" }: InsightOptionInput): EnterpriseChartOption {
  const palette = getOccupancyChartPalette(theme);
  const colors = insightColors(theme, widgetColor);
  const stateColors = [colors.occupied, colors.transition, colors.free, colors.unknown];
  return {
    animation: false,
    backgroundColor: "transparent",
    color: stateColors,
    grid: { left: 8, right: 8, top: 15, bottom: 60, containLabel: true },
    legend: { bottom: 0, left: "center", selectedMode: false, icon: "roundRect", itemWidth: 9, itemHeight: 8, itemGap: 12, textStyle: { color: palette.legendText, fontSize: 10 }, data: STATE_LABELS.map((name, index) => ({ name, itemStyle: { color: stateColors[index] } })) },
    tooltip: { trigger: "axis", confine: true, axisPointer: { type: "shadow" }, backgroundColor: palette.tooltipBackground, borderColor: palette.tooltipBorder, textStyle: { color: palette.tooltipText, fontSize: 12 }, formatter: (params: unknown) => {
      const first = record(Array.isArray(params) ? params[0] : params);
      const day = typeof first.dataIndex === "number" ? model.days[first.dataIndex] : undefined;
      return day ? durationTooltip(formatDateKey(day.dateKey), day, scenarioNames.length) : "";
    } },
    xAxis: { type: "category", data: model.days.map((day) => day.dateKey.slice(-2)), axisTick: { show: false }, axisLine: { lineStyle: { color: palette.axisLine } }, axisLabel: { color: palette.axisText, fontSize: 10, showMinLabel: true, showMaxLabel: true } },
    yAxis: { type: "value", min: 0, max: 100, interval: 25, axisLine: { show: false }, axisLabel: { formatter: "{value}%", color: palette.axisText, fontSize: 10 }, splitLine: { lineStyle: { color: palette.gridLine, type: "dashed" } } },
    series: STATE_KEYS.map((key, index) => ({
      id: `duration-profile-${key}`, name: STATE_LABELS[index], type: "bar", stack: "tempo", barMaxWidth: 32, animation: false,
      itemStyle: { color: stateColors[index] },
      emphasis: { focus: "none" },
      data: model.days.map((day) => day.expectedSeconds > 0 ? percent(day[key], day.expectedSeconds) : null),
      label: {
        show: true, position: "inside", rotate: 0, align: "center", verticalAlign: "middle", distance: 0,
        fontSize: 9, lineHeight: 11, color: theme === "dark" ? "#E2E8F0" : "#13233A",
        // The backing belongs to the visible token only: empty labels on
        // small segments must not produce padded blank pills.
        rich: { value: {
          fontSize: 9, lineHeight: 11, color: theme === "dark" ? "#E2E8F0" : "#13233A",
          backgroundColor: theme === "dark" ? "rgba(15,23,42,0.94)" : "rgba(255,255,255,0.94)",
          borderRadius: 2, padding: [1, 2],
        } },
        formatter: (params: unknown) => dailyProfileLabel(params),
      },
      labelLayout: { hideOverlap: true },
    })),
    media: [
      { query: { maxWidth: 950 }, option: { series: STATE_KEYS.map((key) => ({ id: `duration-profile-${key}`, label: { formatter: (params: unknown) => dailyProfileLabel(params, true) } })) } },
      { query: { maxWidth: 460 }, option: { grid: { bottom: 70 }, legend: { itemGap: 8, textStyle: { fontSize: 9 } }, xAxis: { axisLabel: { fontSize: 9 } } } },
      { query: { maxHeight: 230 }, option: { grid: { top: 6, bottom: 50 }, yAxis: { interval: 50 }, legend: { textStyle: { fontSize: 9 }, itemGap: 6 } } },
    ],
  };
}

function dailyProfileLabel(params: unknown, rounded = false) {
  const value = record(params).value;
  return typeof value === "number" && value >= 8
    ? `{value|${rounded ? Math.round(value) : PERCENT.format(value)}%}`
    : "";
}

export function buildOccupancyDurationInsightReport({
  kind, series, month, widgetColor,
}: {
  kind: OccupancyDurationInsightCardId;
  series: OccupancyDurationInsightScenario[];
  month: OccupancyDurationInsightMonth;
  widgetColor?: string;
}): ReportChart {
  const model = buildOccupancyDurationInsightModel(series, month);
  const title = OCCUPANCY_DURATION_INSIGHT_LABELS[kind];
  const scenarioNames = series.map((item) => item.name);
  const scenarioView = kind === "occupancy_duration_scenario_heatmap";
  const weekView = kind === "occupancy_duration_week_heatmap";
  const dailyView = kind === "occupancy_duration_daily_profile";
  const rows = dailyView
    ? model.days.map((day) => ({ ...day, label: formatDateKey(day.dateKey) }))
    : (scenarioView ? model.scenarioHours : weekView ? model.weekHours : model.dayHours).map((cell) => ({ ...cell, label: scenarioView ? `${scenarioNames[cell.y] ?? "Cenário"} · ${HOURS[cell.x]}` : weekView ? `${WEEKDAYS[cell.x]} · ${HOURS[cell.y]}` : `${formatDateKey(month.dateKeys[cell.x] ?? "")} · ${HOURS[cell.y]}` }));
  const table: ReportTable = {
    title,
    description: `${describeInsight(kind, series.length)} Percentuais calculados sobre o tempo decorrido dos cenários selecionados.`,
    columns: [
      { key: "period", label: scenarioView ? "Cenário / hora" : weekView ? "Dia da semana / hora" : dailyView ? "Dia" : "Dia / hora", width: 34 },
      { key: "occupiedPercent", label: "Ocupado (%)", numeric: true },
      { key: "occupied", label: "Ocupado confirmado" },
      { key: "transition", label: "Transição" },
      { key: "free", label: "Livre confirmado" },
      { key: "unknown", label: "Sem dados" },
      { key: "elapsed", label: series.length > 1 && !scenarioView ? "Tempo somado dos cenários" : "Tempo decorrido" },
    ],
    rows: rows.filter((row) => row.expectedSeconds > 0).map((row) => ({
      period: row.label,
      occupiedPercent: row.confirmedOccupiedSeconds + row.confirmedFreeSeconds > 0 ? Number(percent(row.confirmedOccupiedSeconds, row.expectedSeconds).toFixed(1)) : null,
      occupied: formatOccupancyDuration(row.confirmedOccupiedSeconds),
      transition: formatOccupancyDuration(row.transitionSeconds),
      free: formatOccupancyDuration(row.confirmedFreeSeconds),
      unknown: formatOccupancyDuration(row.unknownSeconds),
      elapsed: formatOccupancyDuration(row.expectedSeconds),
    })),
  };
  return { title, description: table.description, option: buildOccupancyDurationInsightOption({ kind, model, month, scenarioNames, theme: "light", widgetColor }), table };
}

function describeInsight(kind: OccupancyDurationInsightCardId, scenarioCount: number) {
  const composition = scenarioCount === 1 ? "Cenário selecionado" : `${scenarioCount} cenários · tempos somados`;
  if (kind === "occupancy_duration_daily_profile") return `${composition}. Distribuição do tempo decorrido no mês entre ocupado, transição, livre e sem dados.`;
  const detail = kind === "occupancy_duration_month_heatmap" ? "Dias do mês × horas" : kind === "occupancy_duration_week_heatmap" ? "Dias da semana × horas" : "Cada cenário × horas";
  return `${detail} · % do tempo ocupado confirmado no mês. ${composition}.`;
}

function durationTooltip(heading: string, duration: InsightDuration, scenarioCount: number) {
  const lines = [`<strong>${escapeHtml(heading)}</strong>`];
  if (duration.expectedSeconds <= 0) return [...lines, "Intervalo ainda não decorrido."].join("<br/>");
  const hasConfirmation = duration.confirmedOccupiedSeconds + duration.confirmedFreeSeconds > 0;
  lines.push(hasConfirmation ? `Ocupado confirmado: <strong>${formatPercent(duration.confirmedOccupiedSeconds, duration.expectedSeconds)}</strong>` : "Sem tempo ocupado ou livre confirmado.");
  STATE_KEYS.forEach((key, index) => lines.push(`${STATE_LABELS[index]}: ${escapeHtml(formatOccupancyDuration(duration[key]))} · ${formatPercent(duration[key], duration.expectedSeconds)}`));
  lines.push(`${scenarioCount > 1 ? `Tempo somado de ${scenarioCount} cenários` : "Tempo decorrido"}: ${escapeHtml(formatOccupancyDuration(duration.expectedSeconds))}`);
  if (scenarioCount > 1) lines.push("Durações simultâneas de cenários são somadas.");
  return lines.join("<br/>");
}

function insightColors(theme: OccupancyChartTheme, widgetColor: string) {
  const color = /^#[0-9a-f]{6}$/i.test(widgetColor) ? widgetColor : "#1267C4";
  return {
    occupied: color,
    transition: theme === "dark" ? "#B7791F" : "#FCD34D",
    free: theme === "dark" ? "#256D66" : "#A7E3D0",
    unknown: theme === "dark" ? "#475569" : "#CBD5E1",
    future: theme === "dark" ? "rgba(148,163,184,0.025)" : "rgba(148,163,184,0.035)",
    outline: theme === "dark" ? "rgba(148,163,184,0.18)" : "rgba(100,116,139,0.20)",
    heat: monochromeHeatmapPalette(color, theme),
  };
}

function percent(seconds: number, expected: number) {
  return expected > 0 ? Math.max(0, Math.min(100, seconds / expected * 100)) : 0;
}

function formatPercent(seconds: number, expected: number) {
  return `${PERCENT.format(percent(seconds, expected))}%`;
}

function formatDateKey(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
