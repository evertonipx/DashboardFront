function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function synchronizeLineSeriesColor(series: unknown): unknown {
  if (!isRecord(series) || series.type !== "line") return series;

  const lineStyle = isRecord(series.lineStyle) ? series.lineStyle : null;
  const lineColor = lineStyle?.color;
  if (lineColor === undefined || lineColor === null) return series;

  const itemStyle = isRecord(series.itemStyle) ? series.itemStyle : {};
  if (itemStyle.color === lineColor) return series;

  return {
    ...series,
    itemStyle: {
      ...itemStyle,
      color: lineColor,
    },
  };
}

/**
 * Keeps the ECharts visual color of a line series aligned with its stroke.
 *
 * ECharts 6 resolves legend symbols and axis-tooltip markers from the series
 * visual (`itemStyle.color` / palette), while the plotted stroke may be
 * overridden independently by `lineStyle.color`. Keeping both values equal
 * prevents a preceding explicitly-colored series from shifting legend colors.
 */
export function synchronizeLineSeriesVisualColors<T>(option: T): T {
  if (!isRecord(option)) return option;

  const rawSeries = option.series;
  if (!rawSeries) return option;

  if (Array.isArray(rawSeries)) {
    let changed = false;
    const series = rawSeries.map((item) => {
      const synchronized = synchronizeLineSeriesColor(item);
      changed ||= synchronized !== item;
      return synchronized;
    });

    return changed ? ({ ...option, series } as T) : option;
  }

  const series = synchronizeLineSeriesColor(rawSeries);
  return series === rawSeries ? option : ({ ...option, series } as T);
}
