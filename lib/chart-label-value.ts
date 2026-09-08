type ChartAxes = { xAxis?: unknown; yAxis?: unknown };

/** Only an actual numeric zero, never missing data or a false flag. */
export function isZeroChartLabelValue(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value === 0;
  if (typeof value !== "string") return false;
  const text = value.trim();
  // Do not coerce tiny nonzero strings into zero through numeric underflow.
  return /^[+-]?(?:0+\.?0*|\.0+)(?:e[+-]?\d+)?$/i.test(text);
}

/**
 * Finds a label's numeric dimension without treating category coordinates as
 * values. Runtime encode indices take precedence over catalog dimension names.
 * Multidimensional/unknown data remains untouched when no metric is certain.
 */
export function resolveChartLabelValue(
  params: unknown,
  series: Record<string, unknown>,
  option: ChartAxes,
): unknown {
  if (!isRecord(params)) return scalar(params);
  const rawValue = params.value !== undefined ? params.value : params.data;
  // A scalar is already the value ECharts resolved, not an x/y coordinate.
  if (!Array.isArray(rawValue) && !isRecord(rawValue)) return scalar(rawValue);
  const runtimeEncode = isRecord(params.encode) ? params.encode : {};
  const seriesEncode = isRecord(series.encode) ? series.encode : {};
  const dimensions = Array.isArray(params.dimensionNames)
    ? params.dimensionNames
    : Array.isArray(series.dimensions) ? series.dimensions : [];
  const dimension = (reference: unknown) => readDimension(rawValue, reference, dimensions);
  const encoding = (name: string) => {
    if (Object.hasOwn(runtimeEncode, name)) return { present: true, reference: runtimeEncode[name] };
    if (Object.hasOwn(seriesEncode, name)) return { present: true, reference: seriesEncode[name] };
    return { present: false, reference: undefined };
  };
  const valueEncoding = encoding("value");
  if (valueEncoding.present) return dimension(valueEncoding.reference);

  const type = typeof series.type === "string" ? series.type : params.seriesType;
  if (type === "heatmap") return dimension(2);

  const metricAxis = resolveMetricAxis(series, option, type);
  if (metricAxis) {
    const metricEncoding = encoding(metricAxis);
    if (metricEncoding.present) return dimension(metricEncoding.reference);
  }

  for (const name of ["label", "defaultedLabel"]) {
    const labelEncoding = encoding(name);
    if (labelEncoding.present) return dimension(labelEncoding.reference);
  }

  if (isRecord(rawValue) && Object.hasOwn(rawValue, "value")) {
    return resolveChartLabelValue({ ...params, value: rawValue.value }, series, option);
  }
  if (!Array.isArray(rawValue)) return undefined;
  if (rawValue.length === 1 && (type === "line" || type === "bar" || type === "pie" || type === "treemap")) {
    return scalar(rawValue[0]);
  }
  if ((type === "bar" || type === "line") && metricAxis) {
    return dimension(metricAxis === "x" ? 0 : 1);
  }
  return undefined;
}

function resolveMetricAxis(
  series: Record<string, unknown>,
  option: ChartAxes,
  type: unknown,
): "x" | "y" | null {
  if (type !== "bar" && type !== "line") return null;
  const xType = axisType(option.xAxis, series.xAxisIndex);
  const yType = axisType(option.yAxis, series.yAxisIndex);
  if (xType === "value" || xType === "log") {
    return yType === "category" || yType === "time" ? "x" : null;
  }
  if (yType === "value" || yType === "log") {
    return xType === undefined || xType === "category" || xType === "time" ? "y" : null;
  }
  if (yType === "category" || yType === "time") return "x";
  if (xType === undefined || xType === "category" || xType === "time") return "y";
  return null;
}

function axisType(axis: unknown, index: unknown) {
  const record = Array.isArray(axis)
    ? axis[typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : 0]
    : axis;
  if (!isRecord(record)) return undefined;
  return typeof record.type === "string"
    ? record.type
    : Array.isArray(record.data) ? "category" : undefined;
}

function readDimension(value: unknown, reference: unknown, dimensions: unknown[]): unknown {
  if (Array.isArray(reference)) {
    if (reference.length !== 1) return undefined;
    reference = reference[0];
  }
  if (typeof reference !== "string" && typeof reference !== "number") return undefined;
  if (typeof reference === "number" && (!Number.isInteger(reference) || reference < 0)) return undefined;
  const names = dimensions.map((item) =>
    typeof item === "string" ? item : isRecord(item) && typeof item.name === "string" ? item.name : undefined,
  );
  const index = typeof reference === "number" ? reference : names.indexOf(reference);

  if (isRecord(value)) {
    const name = typeof reference === "string" ? reference : names[index];
    if (name !== undefined && Object.hasOwn(value, name)) return scalar(value[name]);
    if (Object.hasOwn(value, "value")) return readDimension(value.value, reference, dimensions);
    return undefined;
  }
  if (Array.isArray(value)) return index >= 0 ? scalar(value[index]) : undefined;
  // Direct scalar series still expose an encoded single value dimension.
  return index === 0 ? scalar(value) : undefined;
}

function scalar(value: unknown) {
  return typeof value === "number" || typeof value === "string" || value === null
    ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
