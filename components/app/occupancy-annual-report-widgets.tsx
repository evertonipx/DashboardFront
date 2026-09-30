"use client";

import * as React from "react";
import { BarChart3, CalendarDays, Grid3X3 } from "lucide-react";

import type { LayoutCard } from "@/components/app/card-layout";
import { EChart, type EnterpriseChartOption } from "@/components/app/deferred-echart";
import {
  occupancySeriesColors,
  resolveOccupancyChartPaletteFromColors,
  type OccupancyChartTheme,
} from "@/components/app/occupancy-chart-palette";
import { useTheme } from "@/components/app/theme-provider";
import { WidgetTitleText, useWidgetColor, useWidgetPalette } from "@/components/app/widget-appearance";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_VALUE_LABEL_ANGLE } from "@/lib/chart-value-labels";
import type { OccupancyAnnualReport, OccupancyAnnualMonthCell } from "@/lib/occupancy-annual-report";
import { getOccupancyColorPalette, type OccupancyColorPaletteId } from "@/lib/occupancy-color-palettes";
import type { ReportChart, ReportTable } from "@/lib/report-export";

export const OCCUPANCY_ANNUAL_CARD_IDS = {
  monthlyComparison: "occupancy_annual_monthly_comparison",
  monthHeatmap: "occupancy_annual_month_heatmap",
  yearSummary: "occupancy_annual_year_summary",
} as const;

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
const VALUE_FORMAT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const PERCENT_FORMAT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

type AnnualWidgetInput = {
  colorPaletteId: OccupancyColorPaletteId;
  error?: string;
  idle?: boolean;
  loading: boolean;
  model: OccupancyAnnualReport;
  scopeName?: string;
};

type AnnualAssetInput = {
  colorByCardId?: ReadonlyMap<string, string | null>;
  colorPaletteId: OccupancyColorPaletteId;
  model: OccupancyAnnualReport;
};

type AnnualColors = {
  axisLine: string;
  axisText: string;
  gridLine: string;
  legendText: string;
  series: string[];
  surface: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
};

/** All three cards consume the same monthly aggregate; rendering adds no requests. */
export function buildOccupancyAnnualWidgetCards({
  colorPaletteId,
  error,
  idle,
  loading,
  model,
  scopeName,
}: AnnualWidgetInput): LayoutCard[] {
  return [
    {
      id: OCCUPANCY_ANNUAL_CARD_IDS.monthlyComparison,
      label: "Comparativo mensal por ano",
      chartTypeEnabled: false,
      colorEditable: true,
      defaultHeight: "tall",
      defaultSize: "full",
      defaultHeightLevel: 5,
      previewKind: "chart",
      titleEditable: true,
      node: () => <MonthlyComparisonCard colorPaletteId={colorPaletteId} error={error} idle={idle} loading={loading} model={model} scopeName={scopeName} />,
    },
    {
      id: OCCUPANCY_ANNUAL_CARD_IDS.monthHeatmap,
      label: "Matriz mensal · anos",
      colorEditable: true,
      colorPreview: "gradient",
      defaultHeight: "tall",
      defaultSize: "full",
      defaultHeightLevel: 5,
      previewKind: "heatmap",
      titleEditable: true,
      node: () => <MonthMatrixCard colorPaletteId={colorPaletteId} error={error} idle={idle} loading={loading} model={model} scopeName={scopeName} />,
    },
    {
      id: OCCUPANCY_ANNUAL_CARD_IDS.yearSummary,
      label: "Picos e perfil anual",
      colorEditable: true,
      defaultHeight: "tall",
      defaultSize: "full",
      defaultHeightLevel: 5,
      previewKind: "chart",
      titleEditable: true,
      node: () => <YearSummaryCard colorPaletteId={colorPaletteId} error={error} idle={idle} loading={loading} model={model} scopeName={scopeName} />,
    },
  ];
}

/** Charts and their detailed tables preserve the visible card order in the PDF. */
export function buildOccupancyAnnualReportAssets({
  colorByCardId,
  colorPaletteId,
  model,
}: AnnualAssetInput): Array<{ cardId: string; chart: ReportChart }> {
  const colors = getOccupancyColorPalette(colorPaletteId).colors;
  const forCard = (cardId: string) =>
    resolveAnnualColors("light", colors, colorByCardId?.get(cardId));
  return [
    {
      cardId: OCCUPANCY_ANNUAL_CARD_IDS.monthlyComparison,
      chart: {
        title: "Comparativo mensal por ano",
        description: "Média de ocupação por mês em todos os anos consultados. O mês atual aparece como parcial; comparações percentuais usam apenas meses fechados.",
        option: buildAnnualMonthlyComparisonOption(model, forCard(OCCUPANCY_ANNUAL_CARD_IDS.monthlyComparison)),
        table: buildMonthlyComparisonTable(model),
      },
    },
    {
      cardId: OCCUPANCY_ANNUAL_CARD_IDS.monthHeatmap,
      chart: {
        title: "Matriz mensal · anos",
        description: "Cada célula contém a média observada do mês; o mês atual é parcial. Meses sem leitura e futuros não representam zero.",
        option: buildAnnualMonthHeatmapOption(model, forCard(OCCUPANCY_ANNUAL_CARD_IDS.monthHeatmap)),
        table: buildMonthHeatmapTable(model),
      },
    },
    {
      cardId: OCCUPANCY_ANNUAL_CARD_IDS.yearSummary,
      chart: {
        title: "Picos e perfil anual",
        description: "Pico máximo observado até o momento, inclusive no mês atual parcial. A média das médias mensais não é ponderada pelo tempo.",
        option: buildAnnualPeakOption(model, forCard(OCCUPANCY_ANNUAL_CARD_IDS.yearSummary)),
        table: buildYearSummaryTable(model),
      },
    },
  ];
}

function MonthlyComparisonCard({ colorPaletteId, error, idle, loading, model, scopeName }: AnnualWidgetInput) {
  const colors = useAnnualColors(colorPaletteId);
  const option = React.useMemo(() => buildAnnualMonthlyComparisonOption(model, colors), [colors, model]);
  const hasData = model.rows.some((row) => row.values.some(isObservedAverage));
  return (
    <AnnualCard
      badge={`${model.years.at(-1)}–${model.selectedYear}`}
      description="Mesmo mês, lado a lado, em todo o histórico. O mês em andamento é parcial."
      icon={BarChart3}
      scopeName={scopeName}
      title="Comparativo mensal por ano"
    >
      {loading ? <Skeleton className="h-full w-full" /> : error ? <AnnualEmptyState error /> : idle ? <AnnualEmptyState idle /> : hasData ? (
        <EChart
          ariaLabel="Comparação das médias mensais de ocupação por ano"
          className="h-full min-h-0 w-full"
          option={option}
          themeMode="explicit"
          valueLabels="auto"
        />
      ) : <AnnualEmptyState />}
    </AnnualCard>
  );
}

function MonthMatrixCard({ colorPaletteId, error, idle, loading, model, scopeName }: AnnualWidgetInput) {
  const colors = useAnnualColors(colorPaletteId);
  const option = React.useMemo(() => buildAnnualMonthHeatmapOption(model, colors), [colors, model]);
  const hasData = model.rows.some((row) => row.values.some(isObservedAverage));
  return (
    <AnnualCard
      badge="12 meses por ano"
      description="A intensidade acompanha a média observada; o mês atual é identificado como parcial."
      icon={Grid3X3}
      scopeName={scopeName}
      title="Matriz mensal · anos"
    >
      {loading ? <Skeleton className="h-full w-full" /> : error ? <AnnualEmptyState error /> : idle ? <AnnualEmptyState idle /> : hasData ? (
        <EChart
          ariaLabel="Matriz de médias mensais de ocupação por ano, com o mês atual indicado como parcial"
          className="h-full min-h-0 w-full"
          option={option}
          themeMode="explicit"
          valueLabels="always"
        />
      ) : <AnnualEmptyState />}
    </AnnualCard>
  );
}

function YearSummaryCard({ colorPaletteId, error, idle, loading, model, scopeName }: AnnualWidgetInput) {
  const colors = useAnnualColors(colorPaletteId);
  const option = React.useMemo(() => buildAnnualPeakOption(model, colors), [colors, model]);
  const hasData = model.rows.some((row) => row.values.some((cell) => isObservedAverage(cell) && cell.peak !== null));
  return (
    <AnnualCard
      badge="Histórico completo"
      description="Pico observado até o mês atual; comparações percentuais usam apenas meses fechados em ambos os anos."
      icon={CalendarDays}
      scopeName={scopeName}
      title="Picos e perfil anual"
    >
      {loading ? <Skeleton className="h-full w-full" /> : error ? <AnnualEmptyState error /> : idle ? <AnnualEmptyState idle /> : hasData ? (
        <div className="flex h-full min-h-0 flex-col gap-2">
          <div className="grid shrink-0 grid-cols-2 gap-1.5 lg:grid-cols-4">
            {model.summaries.map((summary, index) => {
              const matched = model.comparisonSummaries.find((item) => item.baselineYear === summary.year);
              const yearPeak = observedYearPeak(model, summary.year);
              return (
                <div key={summary.year} className="min-w-0 rounded-lg border border-border/60 bg-muted/10 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: annualSeriesColor(colors, index) }} />
                    {summary.year}
                  </div>
                  <div className="mt-1 text-lg font-semibold leading-none tabular-nums" title="Pico máximo observado, inclusive no mês parcial">
                    {formatMetric(yearPeak)}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    pico · {summary.observedMonthCount}/12 meses · {yearStatusLabel(summary, model.selectedYear).toLowerCase()}
                  </div>
                  {matched?.percentageMonthlyAverageChange !== null && matched?.percentageMonthlyAverageChange !== undefined ? (
                    <div className="mt-1 truncate text-[10px] font-medium" title={`Média dos ${matched.matchedMonthCount} meses equivalentes de ${model.selectedYear} contra ${summary.year}`}>
                      {model.selectedYear} vs {summary.year}: {formatPercent(matched.percentageMonthlyAverageChange)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="min-h-0 flex-1">
            <EChart
              ariaLabel="Pico máximo de ocupação observado por ano, inclusive no mês atual parcial"
              className="h-full min-h-0 w-full"
              option={option}
              themeMode="explicit"
              valueLabels="always"
            />
          </div>
        </div>
      ) : <AnnualEmptyState />}
    </AnnualCard>
  );
}

function AnnualCard({
  badge,
  children,
  description,
  icon: Icon,
  scopeName,
  title,
}: {
  badge: string;
  children: React.ReactNode;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  scopeName?: string;
  title: string;
}) {
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <WidgetTitleText fallback={title} />
            </CardTitle>
            <CardDescription className="mt-1 text-[11px] leading-4">{description}</CardDescription>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
            {scopeName ? <Badge variant="secondary" className="max-w-[13rem] truncate text-[10px]" title={scopeName}>{scopeName}</Badge> : null}
            <Badge variant="outline" className="max-w-full shrink-0 text-[10px]">{badge}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 min-w-0 flex-1 overflow-hidden px-3 pb-3 pt-2" data-echart-layout="natural">
        {children}
      </CardContent>
    </Card>
  );
}

function AnnualEmptyState({ error = false, idle = false }: { error?: boolean; idle?: boolean }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-md border border-dashed bg-muted/10 px-4 text-center text-xs text-muted-foreground">
      {error
        ? "Não foi possível carregar a comparação anual nesta visão."
        : idle
          ? "Consulte o relatório para carregar os meses."
          : "Sem meses observados disponíveis para esta visão."}
    </div>
  );
}

function useAnnualColors(colorPaletteId: OccupancyColorPaletteId) {
  const { effectiveTheme } = useTheme();
  const paletteColors = useWidgetPalette();
  const widgetColor = useWidgetColor(
    paletteColors?.[0] ?? getOccupancyColorPalette(colorPaletteId).colors[0],
  );
  return React.useMemo(
    () => resolveAnnualColors(effectiveTheme, paletteColors ?? getOccupancyColorPalette(colorPaletteId).colors, widgetColor),
    [colorPaletteId, effectiveTheme, paletteColors, widgetColor],
  );
}

function resolveAnnualColors(theme: OccupancyChartTheme, rawColors: readonly string[], primaryOverride?: string | null): AnnualColors {
  const palette = resolveOccupancyChartPaletteFromColors(theme, rawColors, primaryOverride);
  const baseSeries = occupancySeriesColors(theme, rawColors, palette.current);
  return {
    axisLine: palette.axisLine,
    axisText: palette.axisText,
    gridLine: palette.gridLine,
    legendText: palette.legendText,
    series: baseSeries.length ? baseSeries : [palette.current],
    surface: palette.surface,
    tooltipBackground: palette.tooltipBackground,
    tooltipBorder: palette.tooltipBorder,
    tooltipText: palette.tooltipText,
  };
}

export function buildAnnualMonthlyComparisonOption(model: OccupancyAnnualReport, colors: AnnualColors): EnterpriseChartOption {
  return {
    animationDuration: 350,
    grid: { bottom: 36, containLabel: true, left: 18, right: 12, top: 72 },
    legend: {
      data: model.years.map(String),
      icon: "roundRect",
      itemHeight: 7,
      itemWidth: 17,
      left: "center",
      selectedMode: false,
      textStyle: { color: colors.legendText, fontSize: 11 },
      top: 2,
      type: "scroll",
    },
    series: model.years.map((year, index) => ({
      barMaxWidth: 18,
      data: model.rows.map((row) => {
        const cell = row.values.find((value) => value.year === year);
        return cell && isObservedAverage(cell) ? cell.average : null;
      }),
      emphasis: { focus: "series" },
      itemStyle: { borderRadius: [3, 3, 0, 0], color: annualSeriesColor(colors, index) },
      label: {
        align: "left",
        color: colors.axisText,
        fontSize: 9,
        formatter: (parameters: { dataIndex?: number; value?: unknown }) => {
          if (typeof parameters.value !== "number") return "";
          const cell = model.rows[parameters.dataIndex ?? -1]?.values.find((item) => item.year === year);
          return `${formatMetric(parameters.value)}${cell?.status === "partial" ? "*" : ""}`;
        },
        position: "top",
        rotate: CHART_VALUE_LABEL_ANGLE,
        show: true,
        verticalAlign: "middle",
      },
      labelLayout: { hideOverlap: true },
      name: String(year),
      type: "bar",
    })),
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      confine: true,
      textStyle: { color: colors.tooltipText, fontSize: 12 },
      trigger: "axis",
      formatter: (raw: unknown) => {
        const items = Array.isArray(raw) ? raw : [raw];
        const first = items[0] as { dataIndex?: number } | undefined;
        const monthIndex = first?.dataIndex ?? -1;
        const month = MONTH_LABELS[monthIndex] ?? "Mês";
        const lines = items.flatMap((item: unknown) => {
          const entry = item as { seriesName?: string; value?: unknown } | null;
          if (!entry || typeof entry.value !== "number") return [];
          const year = Number(entry.seriesName);
          const cell = model.rows[monthIndex]?.values.find((value) => value.year === year);
          return [`${year}: ${formatMetric(entry.value)}${cell?.status === "partial" ? " (parcial)" : ""}`];
        });
        return [month, ...lines].join("<br/>");
      },
    },
    xAxis: {
      axisLabel: { color: colors.axisText, fontSize: 10, interval: 0 },
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisTick: { show: false },
      data: MONTH_LABELS,
      type: "category",
    },
    yAxis: {
      axisLabel: { color: colors.axisText, fontSize: 10 },
      axisLine: { show: false },
      min: 0,
      splitLine: { lineStyle: { color: colors.gridLine } },
      type: "value",
    },
  };
}

export function buildAnnualMonthHeatmapOption(model: OccupancyAnnualReport, colors: AnnualColors): EnterpriseChartOption {
  const years = [...model.years].reverse();
  const cells = years.flatMap((year, yearIndex) =>
    model.rows.map((row, monthIndex) => {
      const cell = row.values.find((value) => value.year === year)!;
      return { yearIndex, monthIndex, value: isObservedAverage(cell) ? cell.average! : null };
    }),
  );
  const maximum = Math.max(1, ...cells.flatMap((cell) => cell.value === null ? [] : [cell.value]));
  const emptyColor = mixHex(colors.surface, colors.axisLine, 0.28);
  const lowColor = mixHex(colors.surface, colors.series[0], 0.13);
  const highColor = mixHex(colors.surface, colors.series[0], 0.82);
  return {
    grid: { bottom: 35, containLabel: true, left: 8, right: 12, top: 16 },
    series: [
      {
        data: cells.filter((cell) => cell.value === null).map((cell) => [cell.monthIndex, cell.yearIndex, -1]),
        emphasis: { disabled: true },
        itemStyle: { borderColor: colors.axisLine, borderWidth: 0.75, color: emptyColor },
        name: "Sem leitura",
        type: "heatmap",
      },
      {
        data: cells.filter((cell) => cell.value !== null).map((cell) => [cell.monthIndex, cell.yearIndex, cell.value]),
        emphasis: { itemStyle: { borderColor: colors.axisText, borderWidth: 1.25 } },
        itemStyle: { borderColor: colors.axisLine, borderWidth: 0.75 },
        label: {
          formatter: (parameters: { data?: unknown }) => {
            const tuple = parameters.data;
            if (!Array.isArray(tuple) || typeof tuple[2] !== "number") return "";
            const tint = mixHex(lowColor, highColor, tuple[2] / maximum);
            const cell = model.rows[tuple[0]]?.values.find((item) => item.year === years[tuple[1]]);
            return `{${readableInk(tint) === "#F8FAFC" ? "light" : "dark"}|${formatMetric(tuple[2])}${cell?.status === "partial" ? "*" : ""}}`;
          },
          fontSize: 10,
          rich: {
            dark: { color: "#122033", fontSize: 10, fontWeight: 700 },
            light: { color: "#F8FAFC", fontSize: 10, fontWeight: 700 },
          },
          show: true,
        },
        name: "Média mensal",
        type: "heatmap",
      },
    ],
    tooltip: {
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      confine: true,
      formatter: (parameters: unknown) => {
        const tuple = !Array.isArray(parameters) && parameters && typeof parameters === "object"
          ? (parameters as { data?: unknown }).data
          : undefined;
        if (!Array.isArray(tuple)) return "";
        const [monthIndex, yearIndex, value] = tuple as number[];
        const cell = model.rows[monthIndex]?.values.find((item) => item.year === years[yearIndex]);
        return `${MONTH_LABELS[monthIndex]}/${years[yearIndex]} · ${value < 0 ? monthStatusLabel(cell?.status ?? "missing") : `média ${formatMetric(value)}${cell?.status === "partial" ? " (parcial)" : ""}`}`;
      },
      textStyle: { color: colors.tooltipText, fontSize: 12 },
      trigger: "item",
    },
    visualMap: [
      { pieces: [{ color: emptyColor, value: -1 }], seriesIndex: 0, show: false, type: "piecewise" },
      { inRange: { color: [lowColor, highColor] }, max: maximum, min: 0, seriesIndex: 1, show: false, type: "continuous" },
    ],
    xAxis: {
      axisLabel: { color: colors.axisText, fontSize: 10, interval: 0 },
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisTick: { show: false },
      data: MONTH_LABELS,
      position: "top",
      splitArea: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: colors.axisText, fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      data: years.map(String),
      splitArea: { show: false },
      type: "category",
    },
  };
}

export function buildAnnualPeakOption(model: OccupancyAnnualReport, colors: AnnualColors): EnterpriseChartOption {
  const years = [...model.years].reverse();
  return {
    grid: { bottom: 20, containLabel: true, left: 14, right: 72, top: 10 },
    series: [{
      barMaxWidth: 26,
      data: years.map((year) => ({
        itemStyle: { borderRadius: [0, 4, 4, 0], color: annualSeriesColor(colors, model.years.indexOf(year)) },
        value: observedYearPeak(model, year),
      })),
      name: "Pico observado",
      type: "bar",
    }],
    tooltip: {
      axisPointer: { type: "shadow" },
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      confine: true,
      textStyle: { color: colors.tooltipText, fontSize: 12 },
      trigger: "axis",
      valueFormatter: (value: unknown) => typeof value === "number" ? formatMetric(value) : "—",
    },
    xAxis: {
      axisLabel: { color: colors.axisText, fontSize: 10 },
      axisLine: { lineStyle: { color: colors.axisLine } },
      min: 0,
      splitLine: { lineStyle: { color: colors.gridLine } },
      type: "value",
    },
    yAxis: {
      axisLabel: { color: colors.axisText, fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      data: years.map(String),
      type: "category",
    },
  };
}

function buildMonthlyComparisonTable(model: OccupancyAnnualReport): ReportTable {
  return {
    title: "Dados - Comparativo mensal por ano",
    description: "Médias mensais observadas por ano. O mês atual aparece como parcial; a variação só compara meses fechados equivalentes.",
    columns: [
      { key: "year", label: "Ano", width: 14 },
      { key: "month", label: "Mês", width: 14 },
      { key: "average", label: "Média", numeric: true, width: 20 },
      { key: "status", label: "Situação", width: 22 },
      { key: "change", label: `Variação % vs ${model.selectedYear - 1}`, numeric: true, width: 25 },
    ],
    rows: model.years.flatMap((year) => model.rows.flatMap((row) => {
        const cell = row.values.find((value) => value.year === year)!;
        if (!isObservedAverage(cell)) return [];
        return [{
          year,
          month: row.label,
          average: cell.average,
          status: cell.status === "partial" ? "Parcial" : "Fechado",
          change: year === model.selectedYear
            ? row.comparisons.find((comparison) => comparison.baselineYear === model.selectedYear - 1)?.percentageAverageChange ?? null
            : null,
        }];
      })),
  };
}

function buildMonthHeatmapTable(model: OccupancyAnnualReport): ReportTable {
  return {
    title: "Dados - Matriz mensal · anos",
    description: "Médias mensais observadas. O mês atual é parcial; uma célula vazia no gráfico não representa ocupação zero.",
    columns: [
      { key: "year", label: "Ano", width: 18 },
      { key: "month", label: "Mês", width: 18 },
      { key: "average", label: "Média mensal", numeric: true, width: 28 },
      { key: "status", label: "Situação", width: 25 },
    ],
    rows: [...model.years].reverse().flatMap((year) => model.rows.flatMap((row) => {
        const cell = row.values.find((value) => value.year === year)!;
        return isObservedAverage(cell) ? [{
          year,
          month: row.label,
          average: cell.average,
          status: cell.status === "partial" ? "Parcial" : "Fechado",
        }] : [];
      })),
  };
}

function buildYearSummaryTable(model: OccupancyAnnualReport): ReportTable {
  return {
    title: "Dados - Picos e perfil anual",
    description: "Picos observados até o mês atual. Médias mensais são aritméticas; comparações usam apenas meses fechados equivalentes.",
    columns: [
      { key: "year", label: "Ano", width: 12 },
      { key: "months", label: "Meses observados", numeric: true, width: 20 },
      { key: "status", label: "Situação", width: 15 },
      { key: "monthlyAverage", label: "Média das médias mensais", numeric: true, width: 28 },
      { key: "peak", label: "Pico", numeric: true, width: 16 },
      { key: "matchedChange", label: `Variação % ${model.selectedYear} vs ano`, numeric: true, width: 20 },
    ],
    rows: model.summaries.map((summary) => {
      const comparison = model.comparisonSummaries.find((item) => item.baselineYear === summary.year);
      return {
        year: summary.year,
        months: summary.observedMonthCount,
        status: yearStatusLabel(summary, model.selectedYear),
        monthlyAverage: summary.monthlyAverage,
        peak: observedYearPeak(model, summary.year),
        matchedChange: comparison?.percentageMonthlyAverageChange ?? null,
      };
    }),
  };
}

function observedYearPeak(model: OccupancyAnnualReport, year: number) {
  const values = model.rows.flatMap((row) => {
    const cell = row.values.find((item) => item.year === year);
    return cell && isObservedAverage(cell) && cell.peak !== null ? [cell.peak] : [];
  });
  return values.length ? Math.max(...values) : null;
}

function isObservedAverage(cell: OccupancyAnnualMonthCell) {
  return (cell.status === "complete" || cell.status === "partial") && cell.average !== null;
}

function yearStatusLabel(summary: OccupancyAnnualReport["summaries"][number], selectedYear: number) {
  if (summary.isComplete) return "Fechado";
  return summary.year === selectedYear ? "Em andamento" : "Incompleto";
}

function annualSeriesColor(colors: AnnualColors, index: number) {
  const base = colors.series[index % colors.series.length];
  const cycle = Math.floor(index / colors.series.length);
  return cycle ? mixHex(base, colors.surface, Math.min(0.45, 0.16 * cycle)) : base;
}

function monthStatusLabel(status: OccupancyAnnualMonthCell["status"]) {
  if (status === "future") return "mês futuro";
  if (status === "partial") return "mês parcial";
  return "sem leitura fechada";
}

function formatMetric(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : VALUE_FORMAT.format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${PERCENT_FORMAT.format(value)}%`;
}

function mixHex(left: string, right: string, share: number) {
  const read = (color: string) => /^#([0-9a-f]{6})$/i.exec(color)?.[1] ?? "000000";
  const a = read(left);
  const b = read(right);
  const channels = [0, 2, 4].map((start) =>
    Math.round(Number.parseInt(a.slice(start, start + 2), 16) * (1 - share) + Number.parseInt(b.slice(start, start + 2), 16) * share),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function readableInk(background: string) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(background.slice(start, start + 2), 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.39 ? "#122033" : "#F8FAFC";
}
