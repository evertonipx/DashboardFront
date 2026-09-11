import type { EnterpriseChartOption } from "@/components/app/echart";
import type { DemographicAggregation } from "@/lib/demographics";
import { demographicComparisonColors } from "@/lib/demographics-comparison-colors";
import { demographicHeatmapColors, demographicHeatmapLabelColor } from "@/lib/demographics-crossing-options";
import { demographicCategoryColor } from "@/lib/demographics-presentation";
import { buildDemographicTemporalPlan, resolveDemographicTemporalPlanCacheKey } from "@/lib/demographics-temporal";
import {
  demographicTemporalCategories,
  isDemographicHourlyProfile,
  normalizeDemographicTemporalSettings,
  type DemographicTemporalSettings,
  type DemographicTemporalWidgetId,
} from "@/lib/demographics-temporal-preferences";
import { DEMOGRAPHIC_VISIBLE_GENDER_KEYS, visibleDemographicDistribution } from "@/lib/demographics-visible-categories";
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
  identifiedGenders?: boolean;
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
const temporalModelCache = new WeakMap<DemographicAggregation, Map<string, DemographicTemporalModel>>();
const temporalViewCache = new WeakMap<ReturnType<typeof buildDemographicTemporalPlan>, Map<string, TemporalView>>();
const comparisonViewCache = new WeakMap<DemographicAggregation, Map<string, TemporalView>>();
const heatmapDataCache = new WeakMap<Datum[][], { available: Datum[]; unavailable: Datum[]; maximum: number }>();
const genderPercentageCache = new WeakMap<Record<string, number>, Record<string, number | null>>();
const summaryIdentities = new WeakMap<DemographicAggregation, number>();
let nextSummaryIdentity = 1;
const TEMPORAL_CACHE_LIMIT = 24;

type TemporalView = {
  title: string;
  description: string;
  points: TemporalPoint[];
  datums: Datum[][];
  table: ReportTable;
  hasData: boolean;
};

/** Consumes the bounded temporal aggregation without changing its raw totals.
 * Gender percentages use both identified genders; a user-selected subset never
 * changes that base. Age and emotion retain the complete interval population. */
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
  // One immutable aggregation is one data revision. Equal totals are not a
  // cache identity: another tenant/window/correction receives a new snapshot.
  const now = input.now ?? new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const prepared = { ...input, now };
  const key = temporalModelKey(prepared, settings, theme);
  const cache = cacheFor(temporalModelCache, input.summary);
  const cached = readCached(cache, key);
  if (cached) return cached;
  const model = createTemporalModel(prepared, settings, categories, theme);
  rememberCached(cache, key, model);
  return model;
}

function createTemporalModel(
  input: DemographicTemporalModelOptions, settings: DemographicTemporalSettings, categories: Category[], theme: Theme,
): DemographicTemporalModel {
  if (input.id === "demographics_period_comparison") {
    return comparisonModel(input, settings, categories, theme);
  }
  const plan = cachedTemporalPlan(input, settings);
  const view = cachedTemporalView(input.id, plan, categories, settings);
  const { points, datums, title, description, table, hasData } = view;
  const heatmap = settings.chartType === "heatmap";
  return {
    title, description, table,
    hasData,
    kind: heatmap ? "heatmap" : "series",
    metric: settings.metric,
    pointCount: points.length,
    categoryCount: categories.length,
    option: heatmap
      ? heatmapOption(points, categories, datums, settings, theme, description)
      : timelineOption(points, categories, datums, settings, theme, description),
  };
}

function timelineOption(
  points: TemporalPoint[], categories: Category[], datums: Datum[][], settings: DemographicTemporalSettings, theme: Theme, description: string,
): EnterpriseChartOption {
  // A single closed day has no temporal slope: separate bars expose every
  // category instead of placing unrelated line markers at the same x point.
  const singlePoint = points.length === 1;
  const bar = settings.chartType === "bar" || singlePoint;
  const stacked = !singlePoint && (settings.chartType === "area" || (bar && settings.metric === "percentage"));
  const solidGenderArea = settings.dimension === "gender" && settings.chartType === "area" && !singlePoint;
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
        ...(settings.chartType === "area" && !singlePoint ? { areaStyle: { color, opacity: settings.dimension === "gender" ? 1 : 0.32 } } : {}),
        data: datums[index],
        connectNulls: false,
        showSymbol: points.length <= 48,
        symbolSize: 5,
        smooth: false,
        barMaxWidth: 32,
        lineStyle: { width: 2, color },
        itemStyle: { color, ...(bar ? { borderRadius: [2, 2, 0, 0] } : {}) },
        label: {
          show: points.length <= 24, fontSize: 10, formatter: datumValueLabel, position: "top",
          // A stacked curve's label can fall inside its neighboring area.
          // An opaque, compact backplate keeps both category fills exact and
          // the value readable regardless of the adjacent palette color.
          ...(solidGenderArea ? {
            backgroundColor: theme === "dark" ? "#18181B" : "#FFFFFF",
            color: theme === "dark" ? "#F8FAFC" : "#0F172A",
            padding: [1, 2], borderRadius: 2,
          } : {}),
        },
        emphasis: { focus: "series" },
      };
    }),
  } as EnterpriseChartOption;
}

function heatmapOption(
  points: TemporalPoint[], categories: Category[], datums: Datum[][], settings: DemographicTemporalSettings, theme: Theme, description: string,
): EnterpriseChartOption {
  const colors = demographicHeatmapColors(settings.palette, theme);
  const { available, unavailable, maximum } = cachedHeatmapData(datums);
  const missingColor = "transparent";
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
            const contrast = demographicHeatmapLabelColor(colors, value / maximum) === "#FFFFFF" ? "light" : "dark";
            return `{${contrast}|${formatValue(value, settings.metric, true)}}`;
          },
          rich: { light: { color: "#FFFFFF", fontWeight: 600 }, dark: { color: "#000000", fontWeight: 600 } },
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
  const cache = cacheFor(comparisonViewCache, input.summary);
  const viewKey = JSON.stringify([summaryIdentity(input.comparisonSummary), referenceLabel, viewSettingsKey(input.id, settings)]);
  const cachedView = readCached(cache, viewKey);
  const points: TemporalPoint[] = cachedView?.points ?? sources.map((summary, index) => ({
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
  const datums = cachedView?.datums ?? categoryDatums(points, categories, settings);
  const heatmap = settings.chartType === "heatmap";
  // Here the legend represents periods, not gender. Neutral period colors
  // avoid giving all current-period categories (including Man) a pink fill.
  const periodColors = demographicComparisonColors(settings.palette, settings.dimension, theme);
  const participation = settings.dimension === "gender" ? "Participação entre gêneros identificados" : "Participação";
  const table: ReportTable = cachedView?.table ?? {
    title, description,
    columns: [
      { key: "category", label: dimensionLabels[settings.dimension] },
      { key: "current_count", label: "Detecções · período analisado", numeric: true },
      { key: "current_percentage", label: `${participation} · período analisado (%)`, numeric: true },
      { key: "reference_count", label: `Detecções · ${referenceLabel}`, numeric: true },
      { key: "reference_percentage", label: `${participation} · ${referenceLabel} (%)`, numeric: true },
      ...(settings.metric === "percentage"
        ? [{ key: "change_pp", label: "Variação (p.p.)", numeric: true }]
        : [
            { key: "change_count", label: "Variação de detecções", numeric: true },
            { key: "change_count_percentage", label: "Variação de detecções (%)", numeric: true },
          ]),
    ],
    rows: categories.map((category, index) => {
      const current = datums[index][0];
      const reference = datums[index][1];
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
  const hasData = cachedView?.hasData ?? points.some((point) => pointHasData(point, settings));
  if (!cachedView) rememberCached(cache, viewKey, { title, description, points, datums, table, hasData });
  const option = heatmap ? heatmapOption(points, categories, datums, settings, theme, description) : {
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
      data: datums.map((category) => category[index]),
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
    hasData,
    kind: heatmap ? "heatmap" : "comparison", metric: settings.metric,
    pointCount: heatmap ? 2 : categories.length,
    categoryCount: heatmap ? categories.length : 2,
  };
}

function pointDatum(point: TemporalPoint, category: Category, settings: DemographicTemporalSettings): Datum {
  const counts = point[settings.dimension];
  const percentages = point.percentages[settings.dimension];
  const count = !point.future && counts ? counts[category.key] ?? 0 : null;
  const identifiedGenders = settings.dimension === "gender";
  const visibleGender = identifiedGenders && !point.future && counts
    ? identifiedGenderPercentages(counts)
    : null;
  const percentage = identifiedGenders
    ? visibleGender?.[category.key] ?? null
    : !point.future && percentages ? percentages[category.key] ?? 0 : null;
  return {
    value: settings.metric === "percentage" ? percentage : count,
    count, percentage, total: point.future ? null : point.total,
    categoryLabel: category.label, periodLabel: point.label, future: point.future,
    metric: settings.metric,
    ...(identifiedGenders ? { identifiedGenders: true } : {}),
  };
}

function pointHasData(point: TemporalPoint, settings: DemographicTemporalSettings) {
  if (point.future || point.total === null) return false;
  if (settings.dimension !== "gender" || point.total === 0) return true;
  return point.gender !== null && DEMOGRAPHIC_VISIBLE_GENDER_KEYS.some((key) => (point.gender?.[key] ?? 0) > 0);
}

function timelineTable(title: string, description: string, points: TemporalPoint[], categories: Category[], datums: Datum[][], settings: DemographicTemporalSettings): ReportTable {
  const rows: ReportTableRow[] = [];
  for (const [pointIndex, point] of points.entries()) {
    for (const [categoryIndex, category] of categories.entries()) {
      const datum = datums[categoryIndex][pointIndex];
      rows.push({ period: point.label, category: category.label, count: datum.count, percentage: datum.percentage, total: datum.total });
    }
  }
  return {
    title, description,
    columns: [
      { key: "period", label: "Intervalo" },
      { key: "category", label: dimensionLabels[settings.dimension] },
      { key: "count", label: "Detecções", numeric: true },
      { key: "percentage", label: settings.dimension === "gender" ? "Participação entre gêneros identificados (%)" : "Participação no intervalo (%)", numeric: true },
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
  if (settings.dimension === "gender") {
    if (id === "demographics_period_comparison") return `Período analisado × ${referenceLabel}. Percentuais entre gêneros identificados de cada período.`;
    const unit = settings.metric === "percentage" ? "Participação entre gêneros identificados em cada intervalo" : "Detecções classificadas por gênero em cada intervalo; percentuais entre gêneros identificados";
    return `${isDemographicHourlyProfile(id) ? "Perfil das 24 horas, no fuso da empresa. " : ""}${unit}.`;
  }
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
      : `Detecções: ${numberFormat.format(datum.count)}<br/>Participação${datum.identifiedGenders ? " entre gêneros identificados" : ""}: ${datum.percentage === null ? "—" : `${percentFormat.format(datum.percentage)}%`}`,
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
  const options = {
    from: input.from, to: input.to, timeZone: input.timeZone,
    now: input.now,
    interval: settings.granularity, maxPoints: 744,
  };
  const key = resolveDemographicTemporalPlanCacheKey(options);
  const cache = cacheFor(temporalPlanCache, input.summary);
  const cached = readCached(cache, key);
  if (cached) return cached;
  const plan = buildDemographicTemporalPlan(input.summary, options);
  rememberCached(cache, key, plan);
  return plan;
}

function cachedTemporalView(
  id: DemographicTemporalWidgetId,
  plan: ReturnType<typeof buildDemographicTemporalPlan>,
  categories: Category[],
  settings: DemographicTemporalSettings,
): TemporalView {
  const cache = cacheFor(temporalViewCache, plan);
  const key = viewSettingsKey(id, settings);
  const cached = readCached(cache, key);
  if (cached) return cached;
  const points = isDemographicHourlyProfile(id) ? plan.hourProfile : plan.points;
  const title = temporalTitle(id, settings);
  const description = temporalDescription(id, settings);
  const datums = categoryDatums(points, categories, settings);
  const view = {
    title, description, points, datums,
    table: timelineTable(title, description, points, categories, datums, settings),
    hasData: points.some((point) => pointHasData(point, settings)),
  };
  rememberCached(cache, key, view);
  return view;
}

function categoryDatums(points: TemporalPoint[], categories: Category[], settings: DemographicTemporalSettings) {
  return categories.map((category) => points.map((point) => pointDatum(point, category, settings)));
}

function cachedHeatmapData(datums: Datum[][]) {
  const cached = heatmapDataCache.get(datums);
  if (cached) return cached;
  const available: Datum[] = [];
  const unavailable: Datum[] = [];
  let maximum = 1;
  for (let pointIndex = 0; pointIndex < (datums[0]?.length ?? 0); pointIndex += 1) {
    datums.forEach((category, categoryIndex) => {
      const datum = category[pointIndex];
      const numeric = typeof datum.value === "number" ? datum.value : null;
      const cell = { ...datum, value: [pointIndex, categoryIndex, numeric ?? -1] };
      (numeric === null ? unavailable : available).push(cell);
      if (numeric !== null) maximum = Math.max(maximum, numeric);
    });
  }
  const value = { available, unavailable, maximum };
  heatmapDataCache.set(datums, value);
  return value;
}

function identifiedGenderPercentages(counts: Record<string, number>) {
  const cached = genderPercentageCache.get(counts);
  if (cached) return cached;
  const percentages = Object.fromEntries(visibleDemographicDistribution(DEMOGRAPHIC_VISIBLE_GENDER_KEYS.map((key) => ({
    key, label: key, count: counts[key] ?? 0, percentage: null, observed: true,
  })), "gender").map((item) => [item.key, item.percentage]));
  genderPercentageCache.set(counts, percentages);
  return percentages;
}

function temporalModelKey(input: DemographicTemporalModelOptions, settings: DemographicTemporalSettings, theme: Theme) {
  const from = instantKey(input.from);
  const to = instantKey(input.to);
  // The public builder resolves one closed-minute clock for both model and
  // planner. Keep this fallback consistent with the planner if reused alone.
  const now = instantKey(input.now ?? new Date(Date.now()));
  const cutoff = typeof to === "number" && typeof now === "number" ? Math.min(now, to) : now;
  const comparison = input.id === "demographics_period_comparison";
  return JSON.stringify([
    input.id, input.timeZone, from, to, cutoff, settings, theme,
    comparison ? summaryIdentity(input.comparisonSummary) : null,
    comparison ? input.comparisonLabel || "Período anterior" : null,
  ]);
}

function viewSettingsKey(id: DemographicTemporalWidgetId, settings: DemographicTemporalSettings) {
  return JSON.stringify([id, settings.dimension, settings.metric, settings.categoryKeys]);
}

function instantKey(value: string | Date) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : String(value);
}

function summaryIdentity(summary: DemographicAggregation | null | undefined) {
  if (!summary) return 0;
  let identity = summaryIdentities.get(summary);
  if (identity === undefined) {
    identity = nextSummaryIdentity++;
    summaryIdentities.set(summary, identity);
  }
  return identity;
}

function cacheFor<Owner extends object, Value>(storage: WeakMap<Owner, Map<string, Value>>, owner: Owner) {
  let cache = storage.get(owner);
  if (!cache) { cache = new Map<string, Value>(); storage.set(owner, cache); }
  return cache;
}

function readCached<Value>(cache: Map<string, Value>, key: string) {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

function rememberCached<Value>(cache: Map<string, Value>, key: string, value: Value) {
  cache.delete(key);
  if (cache.size >= TEMPORAL_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
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
