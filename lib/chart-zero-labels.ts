import { isZeroChartLabelValue, resolveChartLabelValue } from "@/lib/chart-label-value";

type ChartRecord = Record<string, unknown>;
type ChartLabelOption = {
  series?: unknown;
  xAxis?: unknown;
  yAxis?: unknown;
  baseOption?: unknown;
  options?: unknown;
  media?: unknown;
};

const guardedFormatters = new WeakSet<(...args: unknown[]) => unknown>();
const labelledSeries = new Set([
  "bar", "line", "heatmap", "scatter", "effectScatter", "pie", "treemap",
]);

/**
 * A presentation-only boundary shared by screen and exported chart images.
 * Never replace zeros with null, filter points, or change the axes/tooltip.
 * ECharts falls back to its native label when a formatter returns undefined;
 * an empty string is required to suppress just the painted text.
 */
export function suppressZeroChartLabels<T extends ChartLabelOption>(option: T): T {
  let result: T = option;
  const assign = (key: keyof ChartLabelOption, value: unknown) => {
    if (value === option[key]) return;
    if (result === option) result = { ...option };
    (result as ChartRecord)[key] = value;
  };
  assign("series", mapSameShape(option.series, (series) => guardSeries(series, option)));
  if (isRecord(option.baseOption)) {
    assign("baseOption", suppressZeroChartLabels(option.baseOption));
  }
  // Timeline and responsive options are merged over the base series by ECharts.
  // Resolve inherited types/encodings without copying their data into overrides.
  const inherited = isRecord(option.baseOption)
    ? { ...option, ...option.baseOption }
    : option;
  if (Array.isArray(option.options)) {
    assign("options", mapPreservingIdentity(option.options, (entry) =>
      isRecord(entry) ? guardOverride(entry, inherited) : entry,
    ));
  }
  if (Array.isArray(option.media)) {
    assign("media", mapPreservingIdentity(option.media, (entry) => {
      if (!isRecord(entry) || !isRecord(entry.option)) return entry;
      const next = guardOverride(entry.option, inherited);
      return next === entry.option ? entry : { ...entry, option: next };
    }));
  }
  return result;
}

function guardOverride(override: ChartRecord, base: ChartLabelOption) {
  const bases = Array.isArray(base.series) ? base.series : base.series ? [base.series] : [];
  const series = mapSameShape(override.series, (entry, index) => {
    const inherited = typeof entry.id === "string"
      ? bases.find((candidate) => isRecord(candidate) && candidate.id === entry.id)
      : bases[index];
    return guardSeries(entry, { ...base, ...override }, isRecord(inherited) ? inherited : {});
  });
  return series === override.series ? override : { ...override, series };
}

function guardSeries(series: ChartRecord, option: ChartLabelOption, inherited: ChartRecord = {}) {
  const context = { ...inherited, ...series };
  if (typeof context.type !== "string" || !labelledSeries.has(context.type)) return series;
  let next = series;
  const set = (key: string, value: unknown) => {
    if (value === series[key]) return;
    if (next === series) next = { ...series };
    next[key] = value;
  };

  const parentLabel = isRecord(inherited.label) ? inherited.label : undefined;
  const label = isRecord(series.label) ? series.label : undefined;
  set("label", guardLabel(label, context, option, parentLabel?.formatter));
  if (isRecord(series.endLabel)) {
    set("endLabel", guardLabel(series.endLabel, context, option));
  }
  for (const state of ["emphasis", "select", "blur"] as const) {
    const current = series[state];
    if (!isRecord(current)) continue;
    let guardedState = current;
    for (const key of ["label", "endLabel"] as const) {
      if (!isRecord(current[key])) continue;
      const guarded = guardLabel(current[key], context, option);
      if (guarded !== current[key]) guardedState = { ...guardedState, [key]: guarded };
    }
    set(state, guardedState);
  }
  if (Array.isArray(series.data)) {
    set("data", mapPreservingIdentity(series.data, (data) => guardDataItem(data, context, option)));
  }
  return next;
}

function guardDataItem(data: unknown, series: ChartRecord, option: ChartLabelOption): unknown {
  if (!isRecord(data)) return data;
  let next = data;
  const set = (key: string, value: unknown) => {
    if (data[key] === value) return;
    if (next === data) next = { ...data };
    next[key] = value;
  };
  // Without an item formatter, keep inheriting the guarded series formatter.
  // Installing an empty formatter here would lose the parent's rich formatting.
  if (isRecord(data.label) && data.label.formatter != null) {
    set("label", guardLabel(data.label, series, option));
  }
  for (const state of ["emphasis", "select", "blur"] as const) {
    const current = data[state];
    if (!isRecord(current) || !isRecord(current.label) || current.label.formatter == null) continue;
    const label = guardLabel(current.label, series, option);
    if (label !== current.label) set(state, { ...current, label });
  }
  if (Array.isArray(data.children)) {
    set("children", mapPreservingIdentity(data.children, (child) => guardDataItem(child, series, option)));
  }
  return next;
}

function guardLabel(
  label: ChartRecord | undefined,
  series: ChartRecord,
  option: ChartLabelOption,
  inheritedFormatter?: unknown,
) {
  const original = label?.formatter ?? inheritedFormatter;
  if (typeof original === "function" && guardedFormatters.has(original as (...args: unknown[]) => unknown)) return label;
  const formatter = function (this: unknown, ...args: unknown[]) {
    const params = args[0];
    if (isZeroChartLabelValue(resolveChartLabelValue(params, series, option))) return "";
    if (typeof original === "function") return original.apply(this, args);
    if (typeof original === "string") return formatLabelTemplate(original, params);
    return undefined;
  };
  guardedFormatters.add(formatter);
  return { ...label, formatter };
}

/** Preserve ECharts label templates and rich-text wrappers for nonzero values. */
function formatLabelTemplate(template: string, params: unknown) {
  if (!isRecord(params)) return template;
  const variables = Array.isArray(params.$vars)
    ? params.$vars
    : ["seriesName", "name", "value", "percent"];
  return template
    .replace(/\{([a-z])(?:0)?\}/g, (token, letter: string) => {
      const key = variables[letter.charCodeAt(0) - 97];
      return typeof key === "string" ? String(params[key] ?? "") : token;
    })
    .replace(/\{@([^}]+)\}/g, (_token, dimension: string) => {
      const numeric = /^\[(\d+)\]$/.exec(dimension);
      const names = Array.isArray(params.dimensionNames) ? params.dimensionNames : [];
      const index = numeric ? Number(numeric[1]) : names.indexOf(dimension);
      const value = params.value;
      if (Array.isArray(value)) return index >= 0 ? String(value[index] ?? "") : "";
      if (isRecord(value)) {
        const key = numeric ? names[index] : dimension;
        return typeof key === "string" ? String(value[key] ?? "") : "";
      }
      return "";
    });
}

function mapSameShape(value: unknown, transform: (item: ChartRecord, index: number) => ChartRecord) {
  if (Array.isArray(value)) {
    return mapPreservingIdentity(value, (item, index) => isRecord(item) ? transform(item, index) : item);
  }
  return isRecord(value) ? transform(value, 0) : value;
}

function mapPreservingIdentity<T>(items: T[], transform: (item: T, index: number) => T): T[] {
  let next: T[] | undefined;
  items.forEach((item, index) => {
    const value = transform(item, index);
    if (value !== item && !next) next = items.slice();
    if (next) next[index] = value;
  });
  return next ?? items;
}

function isRecord(value: unknown): value is ChartRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
