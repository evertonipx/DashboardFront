import type { EnterpriseChartOption } from "@/components/app/echart";
import { monochromeHeatmapPalette } from "@/lib/chart-palette";

type ChartRecord = Record<string, unknown>;

function record(value: unknown): ChartRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ChartRecord
    : null;
}

function isTransparent(value: unknown) {
  return typeof value === "string" &&
    (/^transparent$/i.test(value) || /^rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value));
}

function orderedPalette(palette: readonly string[], primaryColor: string) {
  const colors = Array.from(new Set(
    palette.filter((color) => /^#[0-9a-f]{6}$/i.test(color)),
  ));
  if (!colors.length) return [];
  const primaryIndex = colors.findIndex(
    (color) => color.toLowerCase() === primaryColor.toLowerCase(),
  );
  if (primaryIndex < 0) return colors;
  return [...colors.slice(primaryIndex), ...colors.slice(0, primaryIndex)];
}

/**
 * Applies a scoped Contagem palette to the data marks of a chart. Axis,
 * tooltip, calendar, empty-cell and semantic status colors are left alone.
 * It is intentionally a presentation transform: old saved views without a
 * palette keep their original appearance and no chart model is mutated.
 */
export function applyCountingViewPalette(
  option: EnterpriseChartOption,
  palette: readonly string[] | null,
  primaryColor: string,
): EnterpriseChartOption {
  if (!palette?.length) return option;
  const colors = orderedPalette(palette, primaryColor);
  if (!colors.length) return option;

  const source = option as ChartRecord;
  const rawSeries = source.series;
  const series = Array.isArray(rawSeries)
    ? rawSeries
    : rawSeries ? [rawSeries] : [];
  const primary = colors[0];
  const hasPrimarySeries = series.some((value) => {
    const itemStyle = record(record(value)?.itemStyle);
    const lineStyle = record(record(value)?.lineStyle);
    const current = itemStyle?.color ?? lineStyle?.color;
    return typeof current === "string" &&
      current.toLowerCase() === primaryColor.toLowerCase();
  });
  let secondaryIndex = 1;
  let dataSeriesIndex = 0;
  let primaryUsed = false;
  const seriesColors: string[] = [];

  const mappedSeries = series.map((raw) => {
    const item = record(raw);
    if (!item) return raw;
    const type = item.type;
    // ECharts visualMap controls heatmap cells. Its out-of-range treatment
    // represents missing coverage and must not become a data color.
    if (type === "heatmap") {
      seriesColors.push(primary);
      return raw;
    }
    const itemStyle = record(item.itemStyle);
    const lineStyle = record(item.lineStyle);
    const areaStyle = record(item.areaStyle);
    const originalColor = itemStyle?.color ?? lineStyle?.color;
    // Invisible scatter overlays carry annotations, not data marks.
    if (type === "scatter" && isTransparent(originalColor)) {
      seriesColors.push(primary);
      return raw;
    }
    const matchesPrimary = typeof originalColor === "string" &&
      originalColor.toLowerCase() === primaryColor.toLowerCase();
    const isPrimary = !primaryUsed &&
      (matchesPrimary || (!hasPrimarySeries && dataSeriesIndex === 0));
    if (isPrimary) primaryUsed = true;
    const seriesColor = isPrimary
      ? primary
      : colors[secondaryIndex++ % colors.length];
    dataSeriesIndex += 1;
    seriesColors.push(seriesColor);

    const rawData = item.data;
    const categorical = series.length === 1 &&
      (type === "bar" || type === "pie") && Array.isArray(rawData);
    const pieItemStyle = type === "pie" && itemStyle
      ? { ...itemStyle }
      : null;
    if (pieItemStyle) delete pieItemStyle.color;
    let categoryIndex = 1;
    const hasPointColors = Array.isArray(rawData) && rawData.some(
      (point) => record(record(point)?.itemStyle)?.color !== undefined,
    );
    const mappedData = hasPointColors && Array.isArray(rawData)
      ? rawData.map((rawPoint) => {
          const point = record(rawPoint);
          const pointStyle = record(point?.itemStyle);
          if (!point || !pointStyle || pointStyle.color === undefined ||
              isTransparent(pointStyle.color)) return rawPoint;
          const pointColor = typeof pointStyle.color === "string" &&
            pointStyle.color.toLowerCase() === primaryColor.toLowerCase()
            ? primary
            : categorical
              ? colors[categoryIndex++ % colors.length]
              : seriesColor;
          return { ...point, itemStyle: { ...pointStyle, color: pointColor } };
        })
      : rawData;

    const markLine = record(item.markLine);
    const markLineStyle = record(markLine?.lineStyle);
    return {
      ...item,
      ...(hasPointColors ? { data: mappedData } : {}),
      ...(type === "pie"
        ? pieItemStyle ? { itemStyle: pieItemStyle } : {}
        : { itemStyle: {
            ...itemStyle,
            ...(isTransparent(itemStyle?.color) ? {} : { color: seriesColor }),
          } }),
      ...(lineStyle ? {
        lineStyle: {
          ...lineStyle,
          ...(isTransparent(lineStyle.color) ? {} : { color: seriesColor }),
        },
      } : {}),
      ...(areaStyle && areaStyle.color !== undefined ? {
        areaStyle: {
          ...areaStyle,
          ...(isTransparent(areaStyle.color) ? {} : { color: seriesColor }),
        },
      } : {}),
      ...(markLine && markLineStyle && !isTransparent(markLineStyle.color)
        ? { markLine: {
            ...markLine,
            lineStyle: { ...markLineStyle, color: colors[1 % colors.length] },
          } }
        : {}),
    };
  });

  const mapVisualMap = (raw: unknown) => {
    const visualMap = record(raw);
    const inRange = record(visualMap?.inRange);
    if (!visualMap || !inRange || !Array.isArray(inRange.color)) return raw;
    return {
      ...visualMap,
      inRange: {
        ...inRange,
        color: monochromeHeatmapPalette(primary),
      },
    };
  };
  const rawVisualMap = source.visualMap;

  return {
    ...option,
    // A one-series bar may be converted to pie/rose by the widget preference.
    // It needs the complete categorical palette even before that conversion.
    // Multi-series charts use the actual series order to match their legend.
    color: series.length === 1 &&
      (record(series[0])?.type === "pie" || record(series[0])?.type === "bar")
      ? colors
      : seriesColors.length ? seriesColors : colors,
    ...(Array.isArray(rawSeries)
      ? { series: mappedSeries }
      : rawSeries ? { series: mappedSeries[0] } : {}),
    ...(Array.isArray(rawVisualMap)
      ? { visualMap: rawVisualMap.map(mapVisualMap) }
      : rawVisualMap ? { visualMap: mapVisualMap(rawVisualMap) } : {}),
  } as EnterpriseChartOption;
}
