import type { EnterpriseChartOption } from "@/components/app/echart";
import { heatmapLabelColor } from "@/lib/chart-palette";
import type { DemographicAggregation } from "@/lib/demographics";
import { demographicHeatmapColors } from "@/lib/demographics-crossing-options";
import { demographicCategoryColor, getDemographicPalette } from "@/lib/demographics-presentation";
import { buildDemographicTemporalPlan } from "@/lib/demographics-temporal";
import {
  demographicTemporalCategories,
  isDemographicHourlyProfile,
  normalizeDemographicTemporalSettings,
  type DemographicTemporalSettings,
  type DemographicTemporalWidgetId,
} from "@/lib/demographics-temporal-preferences";
import type { ReportTable, ReportTableRow } from "@/lib/report-export";

type Theme = "light" | "dark";
type Category = { key: string; label: string };
type TemporalPoint = {
  label: string;
  total: number | null;
  gender: Record<string, number> | null;
  age: Record<string, number> | null;
  emotion: Record<string, number> | null;
  percentages: {
    gender: Record<string, number> | null;
    age: Record<string, number> | null;
    emotion: Record<string, number> | null;
  };
  future: boolean;
};
type Datum = {
  value: number | null | Array<number | null>;
  count: number | null;
  percentage: number | null;
  total: number | null;
  categoryLabel: string;
  periodLabel: string;
  future?: boolean;
  metric: DemographicTemporalSettings["metric"];
};

export type DemographicTemporalModel = {
  option: EnterpriseChartOption;
  table: ReportTable;
  hasData: boolean;
  description: string;
  title: string;
  kind: "heatmap" | "series" | "comparison";
  metric: DemographicTemporalSettings["metric"];
  pointCount: number;
  categoryCount: number;
};

export type DemographicTemporalModelOptions = {
  id: DemographicTemporalWidgetId;
  summary: DemographicAggregation;
  comparisonSummary?: DemographicAggregation | null;
  comparisonLabel?: string;
  settings?: unknown;
  from: Date | string;
  to: Date | string;
  timeZone: string;
  now?: Date | string;
  theme?: Theme;
  enabled?: boolean;
};

const numberFormat = new Intl.NumberFormat("pt-BR");
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const compactPercentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const dimensionLabels = { gender: "Gênero", age: "Faixa etária", emotion: "Emoção" };
const temporalPlanCache = new WeakMap<DemographicAggregation, Map<string, ReturnType<typeof buildDemographicTemporalPlan>>>();

/** Consumes the bounded temporal aggregation. Filtering is presentation-only:
 * percentages always come from the complete interval, never a visible subtotal. */
export function buildDemographicTemporalModel(input: DemographicTemporalModelOptions): DemographicTemporalModel {
  const settings = normalizeDemographicTemporalSettings(input.settings, input.id);
  const categories = demographicTemporalCategories(settings.dimension).filter(({ key }) =>
    !settings.categoryKeys.length || settings.categoryKeys.includes(key));
  const theme = input.theme ?? "light";
  if (input.enabled === false) {
    const title = temporalTitle(input.id, settings);
    const description = temporalDescription(input.id, settings, input.comparisonLabel);
    return {
      title, description,
      table: { title, description, columns: [], rows: [] },
      option: { ...baseOption(theme, description), series: [] },
      hasData: false,
      kind: settings.chartType === "heatmap" ? "heatmap" : input.id === "demographics_period_comparison" ? "comparison" : "series",
      metric: settings.metric, pointCount: 0, categoryCount: categories.length,
    };
  }
  if (input.id === "demographics_period_comparison") {
    return comparisonModel(input, settings, categories, theme);
  }
  const profile = isDemographicHourlyProfile(input.id);
  const plan = cachedTemporalPlan(input, settings);
  const points: TemporalPoint[] = profile ? plan.hourProfile : plan.points;
  const title = temporalTitle(input.id, settings);
  const description = temporalDescription(input.id, settings);
  const table = timelineTable(title, description, points, categories, settings);
  const heatmap = settings.chartType === "heatmap";
  return {
    title, description, table,
    hasData: points.some((point) => point.total !== null && !point.future),
    kind: heatmap ? "heatmap" : "series",
    metric: settings.metric,
    pointCount: points.length,
    categoryCount: categories.length,
    option: heatmap
      ? heatmapOption(points, categories, settings, theme, description)
      : timelineOption(points, categories, settings, theme, description),
  };
}

function timelineOption(
  points: TemporalPoint[], categories: Category[], settings: DemographicTemporalSettings, theme: Theme, description: string,
): EnterpriseChartOption {
  // A single closed day has no temporal slope: separate bars expose every
  // category instead of placing unrelated line markers at the same x point.
  const singlePoint = points.length === 1;
  const bar = settings.chartType === "bar" || singlePoint;
  const stacked = !singlePoint && (settings.chartType === "area" || (bar && settings.metric === "percentage"));
  return {
    ...baseOption(theme, description),
    color: categories.map(({ key }, index) => demographicCategoryColor(key, index, settings.palette, settings.dimension)),
    grid: { left: 4, right: 18, top: 38, bottom: 12, containLabel: false, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    legend: { ...legendStyle(theme), data: categories.map(({ label }) => label) },
    tooltip: { trigger: "axis", confine: true, formatter: temporalTooltip },
    xAxis: categoryAxis(points.map((point) => point.label), theme),
    yAxis: valueAxis(settings.metric, theme),
    series: categories.map((category, index) => {
      const color = demographicCategoryColor(category.key, index, settings.palette, settings.dimension);
      return {
        name: category.label,
        type: bar ? "bar" : "line",
        ...(stacked ? { stack: "demographic-share" } : {}),
        ...(settings.chartType === "area" && !singlePoint ? { areaStyle: { opacity: 0.32 } } : {}),
        data: points.map((point) => pointDatum(point, category, settings)),
        connectNulls: false,
        showSymbol: points.length <= 48,
        symbolSize: 5,
        smooth: false,
        barMaxWidth: 32,
        lineStyle: { width: 2, color },
        itemStyle: { color, ...(bar ? { borderRadius: [2, 2, 0, 0] } : {}) },
        label: { show: points.length <= 24, fontSize: 10, formatter: datumValueLabel, position: "top" },
        emphasis: { focus: "series" },
      };
    }),
  } as EnterpriseChartOption;
}

function heatmapOption(
  points: TemporalPoint[], categories: Category[], settings: DemographicTemporalSettings, theme: Theme, description: string,
): EnterpriseChartOption {
  const colors = demographicHeatmapColors(settings.palette, theme);
  const available: Datum[] = [];
  const unavailable: Datum[] = [];
  points.forEach((point, pointIndex) => categories.forEach((category, categoryIndex) => {
    const datum = pointDatum(point, category, settings);
    const numeric = typeof datum.value === "number" ? datum.value : null;
    const cell = { ...datum, value: [pointIndex, categoryIndex, numeric ?? -1] };
    (numeric === null ? unavailable : available).push(cell);
  }));
  const maximum = Math.max(1, ...available.map((datum) => (datum.value as number[])[2]));
  const missingColor = theme === "dark" ? "#1E293B" : "#EEF2F6";
  const borderColor = theme === "dark" ? "rgba(226, 232, 240, 0.12)" : "rgba(15, 23, 42, 0.09)";
  const textColor = theme === "dark" ? "#CBD5E1" : "#526477";
  return {
    ...baseOption(theme, description),
    grid: { left: 4, right: 8, top: 8, bottom: 44, containLabel: false, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    legend: { show: false },
    tooltip: { trigger: "item", confine: true, formatter: temporalTooltip },
    xAxis: { ...categoryAxis(points.map((point) => point.label), theme), axisLabel: { color: textColor, fontSize: 10, interval: 0, margin: 8 } },
    yAxis: { ...categoryAxis(categories.map((category) => category.label), theme), inverse: true, axisLabel: { color: textColor, fontSize: 10, interval: 0, margin: 8, width: 90, overflow: "truncate" } },
    visualMap: [
      { type: "piecewise", show: false, seriesIndex: 0, dimension: 2, pieces: [{ value: -1, color: missingColor }] },
      {
        min: 0, max: maximum, dimension: 2, seriesIndex: 1,
        inRange: { color: colors }, calculable: false,
        orient: "horizontal", left: "center", bottom: 0, itemHeight: 130, itemWidth: 8,
        text: [formatValue(maximum, settings.metric), "0"], textGap: 8,
        textStyle: { color: textColor, fontSize: 10 },
      },
    ],
    series: [
      {
        name: "Sem valor", type: "heatmap", data: unavailable, label: { show: false },
        itemStyle: { color: missingColor, borderColor, borderWidth: 0.5 },
        emphasis: { disabled: true },
      },
      {
        name: settings.metric === "percentage" ? "Participação" : "Detecções", type: "heatmap", data: available,
        itemStyle: { borderColor, borderWidth: 0.5 },
        progressive: 1_000,
        emphasis: { itemStyle: {
          borderColor: theme === "dark" ? "rgba(248, 250, 252, 0.24)" : "rgba(15, 23, 42, 0.20)", borderWidth: 1,
        } },
        label: {
          show: true, fontSize: 10, fontWeight: 600,
          formatter: (parameters: unknown) => {
            const datum = parameterDatum(parameters);
            const value = Array.isArray(datum?.value) ? datum.value[2] : null;
            if (typeof value !== "number" || value <= 0) return "";
            const contrast = heatmapLabelColor(colors, value / maximum) === "#FFFFFF" ? "light" : "dark";
            return `{${contrast}|${formatValue(value, settings.metric, true)}}`;
          },
          rich: { light: { color: "#FFFFFF", fontWeight: 600 }, dark: { color: "#0F172A", fontWeight: 600 } },
        },
      },
    ],
  } as EnterpriseChartOption;
}

function comparisonModel(
  input: DemographicTemporalModelOptions, settings: DemographicTemporalSettings, categories: Category[], theme: Theme,
): DemographicTemporalModel {
  const title = temporalTitle(input.id, settings);
  const referenceLabel = input.comparisonLabel || "Período anterior";
  const description = temporalDescription(input.id, settings, referenceLabel);
  const sources = [input.summary, input.comparisonSummary];
  const periodLabels = ["Período analisado", referenceLabel];
  const points: TemporalPoint[] = sources.map((summary, index) => ({
    label: periodLabels[index],
    total: summary?.hasData ? summary.total : null,
    gender: summary?.hasData ? distributionCounts(summary.gender) : null,
    age: summary?.hasData ? distributionCounts(summary.age) : null,
    emotion: summary?.hasData ? distributionCounts(summary.emotion) : null,
    percentages: {
      gender: summary?.hasData && summary.total > 0 ? distributionPercentages(summary.gender) : null,
      age: summary?.hasData && summary.total > 0 ? distributionPercentages(summary.age) : null,
      emotion: summary?.hasData && summary.total > 0 ? distributionPercentages(summary.emotion) : null,
    },
    future: false,
  }));
  const heatmap = settings.chartType === "heatmap";
  const colors = getDemographicPalette(settings.palette).colors;
  // Here the legend represents periods, not gender. Neutral period colors
  // avoid giving all current-period categories (including Man) a pink fill.
  const periodColors = settings.dimension === "gender"
    ? theme === "dark" ? ["#CBD5E1", "#64748B"] : ["#475569", "#CBD5E1"]
    : [colors[0], "#94A3B8"];
  const table: ReportTable = {
    title, description,
    columns: [
      { key: "category", label: dimensionLabels[settings.dimension] },
      { key: "current_count", label: "Detecções · período analisado", numeric: true },
      { key: "current_percentage", label: "Participação · período analisado (%)", numeric: true },
      { key: "reference_count", label: `Detecções · ${referenceLabel}`, numeric: true },
      { key: "reference_percentage", label: `Participação · ${referenceLabel} (%)`, numeric: true },
      ...(settings.metric === "percentage"
        ? [{ key: "change_pp", label: "Variação (p.p.)", numeric: true }]
        : [
            { key: "change_count", label: "Variação de detecções", numeric: true },
            { key: "change_count_percentage", label: "Variação de detecções (%)", numeric: true },
          ]),
    ],
    rows: categories.map((category) => {
      const current = pointDatum(points[0], category, settings);
      const reference = pointDatum(points[1], category, settings);
      return {
        category: category.label,
        current_count: current.count, current_percentage: current.percentage,
        reference_count: reference.count, reference_percentage: reference.percentage,
        change_pp: current.percentage !== null && reference.percentage !== null ? current.percentage - reference.percentage : null,
        change_count: current.count !== null && reference.count !== null ? current.count - reference.count : null,
        change_count_percentage: current.count !== null && reference.count !== null && reference.count > 0
          ? (current.count - reference.count) / reference.count * 100 : null,
      };
    }),
  };
  const option = heatmap ? heatmapOption(points, categories, settings, theme, description) : {
    ...baseOption(theme, `${description} As cores distinguem os períodos; as categorias estão no eixo horizontal.`),
    color: periodColors,
    grid: { left: 4, right: 18, top: 42, bottom: 14, containLabel: false, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
    legend: { ...legendStyle(theme), data: periodLabels, formatter: (name: string) => name === "Período analisado" ? name : "Período de comparação" },
    tooltip: { trigger: "axis", confine: true, formatter: temporalTooltip },
    xAxis: categoryAxis(categories.map((category) => category.label), theme),
    yAxis: valueAxis(settings.metric, theme),
    series: points.map((point, index) => ({
      name: point.label,
      type: settings.chartType === "bar" ? "bar" : "line",
      data: categories.map((category) => pointDatum(point, category, settings)),
      connectNulls: false, showSymbol: true, symbolSize: 6, smooth: false,
      symbol: index === 0 ? "circle" : "diamond",
      lineStyle: { color: periodColors[index], width: 2, type: index === 0 ? "solid" : "dashed" },
      ...(settings.chartType === "area" ? { areaStyle: { opacity: 0.12 } } : {}),
      barMaxWidth: 42,
      itemStyle: { color: periodColors[index], borderRadius: [3, 3, 0, 0] },
      label: { show: true, fontSize: 10, formatter: datumValueLabel, position: "top" },
      emphasis: { focus: "series" },
    })),
  } as EnterpriseChartOption;
  return {
    title, description, table, option,
    hasData: sources.some((summary) => summary?.hasData),
    kind: heatmap ? "heatmap" : "comparison", metric: settings.metric,
    pointCount: heatmap ? 2 : categories.length,
    categoryCount: heatmap ? categories.length : 2,
  };
}

function pointDatum(point: TemporalPoint, category: Category, settings: DemographicTemporalSettings): Datum {
  const counts = point[settings.dimension];
  const percentages = point.percentages[settings.dimension];
  const count = !point.future && counts ? counts[category.key] ?? 0 : null;
  const percentage = !point.future && percentages ? percentages[category.key] ?? 0 : null;
  return {
    value: settings.metric === "percentage" ? percentage : count,
    count, percentage, total: point.future ? null : point.total,
    categoryLabel: category.label, periodLabel: point.label, future: point.future,
    metric: settings.metric,
  };
}

function timelineTable(title: string, description: string, points: TemporalPoint[], categories: Category[], settings: DemographicTemporalSettings): ReportTable {
  const rows: ReportTableRow[] = [];
  for (const point of points) {
    for (const category of categories) {
      const datum = pointDatum(point, category, settings);
      rows.push({ period: point.label, category: category.label, count: datum.count, percentage: datum.percentage, total: datum.total });
    }
  }
  return {
    title, description,
    columns: [
      { key: "period", label: "Intervalo" },
      { key: "category", label: dimensionLabels[settings.dimension] },
      { key: "count", label: "Detecções", numeric: true },
      { key: "percentage", label: "Participação no intervalo (%)", numeric: true },
      { key: "total", label: "Total do intervalo", numeric: true },
    ],
    rows,
  };
}

function baseOption(theme: Theme, description: string): EnterpriseChartOption {
  return {
    animationDuration: 250,
    aria: { enabled: true, decal: { show: false }, description },
    textStyle: { color: theme === "dark" ? "#CBD5E1" : "#526477" },
  };
}

function temporalTitle(id: DemographicTemporalWidgetId, settings: DemographicTemporalSettings) {
  const dimension = dimensionLabels[settings.dimension];
  return id === "demographics_period_comparison" ? `Comparativo de ${dimension.toLocaleLowerCase("pt-BR")}`
    : isDemographicHourlyProfile(id) ? `${dimension} por horário`
      : id === "demographics_daily_evolution" ? `Evolução de ${dimension.toLocaleLowerCase("pt-BR")}`
        : `${dimension} ao longo do tempo`;
}

function temporalDescription(id: DemographicTemporalWidgetId, settings: DemographicTemporalSettings, referenceLabel = "Período anterior") {
  if (id === "demographics_period_comparison") return `Período analisado × ${referenceLabel}. Percentuais calculados sobre o total de cada período.`;
  const unit = settings.metric === "percentage" ? "Participação no total de cada intervalo" : "Detecções classificadas em cada intervalo";
  return `${isDemographicHourlyProfile(id) ? "Perfil das 24 horas, no fuso da empresa. " : ""}${unit}.`;
}

function legendStyle(theme: Theme) {
  return {
    top: 0, left: 0, right: 0, type: "scroll", selectedMode: false,
    itemWidth: 9, itemHeight: 9, itemGap: 14,
    textStyle: { color: theme === "dark" ? "#CBD5E1" : "#526477", fontSize: 10 },
    pageIconSize: 10,
  };
}

function categoryAxis(data: string[], theme: Theme) {
  return {
    type: "category", data,
    axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    axisLabel: { color: theme === "dark" ? "#CBD5E1" : "#526477", fontSize: 10, hideOverlap: true, margin: 10 },
  };
}

function valueAxis(metric: DemographicTemporalSettings["metric"], theme: Theme) {
  const color = theme === "dark" ? "#CBD5E1" : "#526477";
  return {
    type: "value", min: 0, ...(metric === "percentage" ? { max: 100 } : { minInterval: 1 }), splitNumber: 4,
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color, fontSize: 10, hideOverlap: true, formatter: (value: number) => formatValue(value, metric) },
    splitLine: { lineStyle: { color, opacity: 0.10, type: "dashed" } },
  };
}

function temporalTooltip(parameters: unknown) {
  const entries = (Array.isArray(parameters) ? parameters : [parameters]).map(parameterDatum).filter((datum): datum is Datum => Boolean(datum));
  if (!entries.length) return "Sem valor";
  return entries.map((datum) => [
    `<strong>${escapeHtml(`${datum.periodLabel} · ${datum.categoryLabel}`)}</strong>`,
    datum.future ? "Horário futuro" : datum.count === null ? "Sem dados neste intervalo"
      : `Detecções: ${numberFormat.format(datum.count)}<br/>Participação: ${datum.percentage === null ? "—" : `${percentFormat.format(datum.percentage)}%`}`,
  ].join("<br/>")).join("<br/><br/>");
}

function parameterDatum(parameters: unknown): Datum | null {
  const parameter = Array.isArray(parameters) ? parameters[0] : parameters;
  if (!parameter || typeof parameter !== "object") return null;
  const datum = (parameter as { data?: unknown }).data;
  return datum && typeof datum === "object" && "categoryLabel" in datum && "periodLabel" in datum ? datum as Datum : null;
}

function datumValueLabel(parameters: unknown) {
  const datum = parameterDatum(parameters);
  if (!datum || typeof datum.value !== "number" || datum.value <= 0) return "";
  return formatValue(datum.value, datum.metric);
}

function formatValue(value: number, metric: DemographicTemporalSettings["metric"], compact = false) {
  return metric === "percentage" ? `${(compact ? compactPercentFormat : percentFormat).format(value)}%` : numberFormat.format(value);
}

function distributionCounts(items: DemographicAggregation["gender"] | DemographicAggregation["age"] | DemographicAggregation["emotion"]): Record<string, number> {
  return Object.fromEntries(items.map((item) => [item.key, item.count]));
}

function distributionPercentages(items: DemographicAggregation["gender"] | DemographicAggregation["age"] | DemographicAggregation["emotion"]): Record<string, number> {
  return Object.fromEntries(items.map((item) => [item.key, item.percentage ?? 0]));
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function cachedTemporalPlan(input: DemographicTemporalModelOptions, settings: DemographicTemporalSettings) {
  const timestamp = (value: string | Date | undefined) => value instanceof Date ? value.toISOString() : value ?? "";
  const now = input.now ?? new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const key = [input.timeZone, timestamp(input.from), timestamp(input.to), timestamp(now), settings.granularity].join("|");
  let cache = temporalPlanCache.get(input.summary);
  const cached = cache?.get(key);
  if (cached) return cached;
  const plan = buildDemographicTemporalPlan(input.summary, {
    from: input.from, to: input.to, timeZone: input.timeZone,
    now,
    interval: settings.granularity, maxPoints: 744,
  });
  if (!cache) { cache = new Map(); temporalPlanCache.set(input.summary, cache); }
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(key, plan);
  return plan;
}

/** Applies only drawing density. Canonical values, categories, and tooltips
 * remain unchanged; undersized heat cells never shrink text below 9 pixels. */
export function demographicTemporalValueLabels(
  model: Pick<DemographicTemporalModel, "kind" | "pointCount" | "categoryCount">,
  { width, height }: { width: number; height: number },
): "none" | "always" {
  if (model.kind === "heatmap") return "none";
  if (model.kind === "series" && height < 180 && model.pointCount > 6) return "none";
  return model.pointCount * model.categoryCount > Math.max(24, width / 8) ? "none" : "always";
}

export function fitDemographicTemporalOption(
  model: DemographicTemporalModel,
  { width, height }: { width: number; height: number },
): EnterpriseChartOption {
  const source = model.option as Record<string, unknown>;
  const compact = height < 220;
  const narrow = width < 440;
  const grid = record(source.grid);
  const xAxis = record(source.xAxis);
  const yAxis = record(source.yAxis);
  const series = Array.isArray(source.series) ? source.series : [];
  const heatmap = model.kind === "heatmap";
  const numeric = series.flatMap((item) => {
    const data = record(item).data;
    return Array.isArray(data) ? data.map((datum) => record(datum).value).filter(Array.isArray).map((value) => value[2]).filter((value): value is number => typeof value === "number" && value > 0) : [];
  });
  const maxCharacters = Math.max(3, ...numeric.map((value) => formatValue(value, model.metric, true).length));
  const cellWidth = (width - (narrow ? 88 : 108)) / Math.max(1, model.pointCount);
  const cellHeight = (height - (compact ? 52 : 76)) / Math.max(1, model.categoryCount);
  const showHeatLabels = cellWidth >= maxCharacters * 5.6 + 3 && cellHeight >= 13;
  return {
    ...model.option,
    grid: { ...grid, left: 4, right: heatmap ? 6 : 16, top: heatmap ? 6 : compact ? 32 : 42, bottom: heatmap ? compact ? 12 : 40 : 8 },
    xAxis: {
      ...xAxis,
      axisLabel: {
        ...record(xAxis.axisLabel), fontSize: narrow ? 9 : 10,
        ...(heatmap ? { interval: Math.max(0, Math.ceil(model.pointCount / (narrow ? 8 : 24)) - 1), rotate: 0 } : { hideOverlap: true }),
        ...(!heatmap && narrow ? {
          formatter: (label: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(label) ? label.slice(0, 5) : label,
        } : {}),
      },
    },
    yAxis: {
      ...yAxis,
      axisLabel: {
        ...record(yAxis.axisLabel), fontSize: narrow ? 9 : 10,
        ...(heatmap ? { width: narrow ? 70 : 90, overflow: "truncate", interval: 0 } : {}),
      },
    },
    series: series.map((item, index) => {
      const candidate = record(item);
      return {
        ...candidate,
        label: { ...record(candidate.label), fontSize: narrow ? 9 : 10, ...(heatmap ? { show: index > 0 && showHeatLabels } : {}) },
      };
    }),
    ...(heatmap && Array.isArray(source.visualMap) ? {
      visualMap: source.visualMap.map((item) => ({ ...record(item), ...(compact ? { show: false } : {}) })),
    } : {}),
  } as EnterpriseChartOption;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
