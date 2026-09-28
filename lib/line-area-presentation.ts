const DEFAULT_AREA_OPACITY = 0.26;
const SUPPORTING_AREA_OPACITY = 0.16;
const REFERENCE_AREA_OPACITY = 0.08;
const STACKED_AREA_OPACITY = 0.55;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTransparentColor(value: unknown) {
  if (typeof value !== "string") return false;
  const color = value.toLowerCase().replace(/\s+/g, "");
  return color === "transparent" ||
    /^rgba\([^)]*,0(?:\.0+)?\)$/.test(color) ||
    /^#[\da-f]{6}00$/.test(color) ||
    /^#[\da-f]{3}0$/.test(color);
}

/**
 * Gives every line series the area presentation in both the interactive chart
 * and its export. Numerical data and existing stacks are untouched: unrelated
 * comparisons are not summed just because they share an axis.
 */
export function applyLineAreaPresentation<T>(option: T): T {
  if (!isRecord(option) || !option.series) return option;

  const rawSeries = Array.isArray(option.series)
    ? option.series
    : [option.series];
  const hasBars = rawSeries.some((item) => isRecord(item) && item.type === "bar");
  const hasScatter = rawSeries.some((item) =>
    isRecord(item) && (item.type === "scatter" || item.type === "effectScatter"),
  );
  let changed = false;
  const series = rawSeries.map((item) => {
    if (!isRecord(item) || item.type !== "line") return item;

    const existingAreaStyle = isRecord(item.areaStyle) ? item.areaStyle : null;
    const areaStyle = existingAreaStyle ?? {};
    const existingOpacity = areaStyle.opacity;
    if (
      existingAreaStyle &&
      (existingOpacity === undefined ||
        (typeof existingOpacity === "number" && existingOpacity > 0)) &&
      !isTransparentColor(areaStyle.color)
    ) {
      return item;
    }

    const reference = item.silent === true || hasScatter;
    const supporting = hasBars ||
      (isRecord(item.lineStyle) && item.lineStyle.type !== undefined && item.lineStyle.type !== "solid");
    const opacity = item.stack
      ? STACKED_AREA_OPACITY
      : reference ? REFERENCE_AREA_OPACITY
        : supporting ? SUPPORTING_AREA_OPACITY : DEFAULT_AREA_OPACITY;

    const visibleAreaStyle = { ...areaStyle };
    if (isTransparentColor(visibleAreaStyle.color)) delete visibleAreaStyle.color;

    changed = true;
    return {
      ...item,
      areaStyle: {
        ...visibleAreaStyle,
        opacity,
      },
    };
  });

  if (!changed) return option;
  return {
    ...option,
    series: Array.isArray(option.series) ? series : series[0],
  } as T;
}
