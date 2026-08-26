/**
 * Shared angle for numeric labels anchored to non-horizontal bars and line
 * points. Forty-five degrees keeps the values permanently visible without the
 * harder reading direction created by fully vertical text.
 */
export const CHART_VALUE_LABEL_ANGLE = 45;

type LabelLayoutParams = {
  dataIndex?: number;
};

type LabelLayoutResult = Record<string, unknown>;

type LabelLayoutOption =
  | LabelLayoutResult
  | ((params: LabelLayoutParams) => LabelLayoutResult | null | undefined)
  | null
  | undefined;

/**
 * Keeps every angled value growing toward the upper-right. The trailing value
 * uses a right anchor to stay inside a closed canvas without mirroring its
 * reading direction; the chart grid already reserves the required edge space.
 */
export function composeChartValueLabelLayout(
  existing: unknown,
  {
    angled,
    hideOverlap,
    lastDataIndex,
    moveOverlap,
  }: {
    angled: boolean;
    hideOverlap: boolean;
    lastDataIndex: number;
    moveOverlap?: "shiftX" | "shiftY";
  },
) {
  const existingLayout = isLabelLayoutOption(existing) ? existing : undefined;

  return (params: LabelLayoutParams): LabelLayoutResult => {
    const resolved =
      typeof existingLayout === "function"
        ? existingLayout(params) ?? {}
        : existingLayout ?? {};
    const trailingEdge =
      angled && lastDataIndex > 0 && params.dataIndex === lastDataIndex;

    return {
      ...resolved,
      ...(moveOverlap ? { moveOverlap } : {}),
      hideOverlap,
      ...(angled ? { rotate: CHART_VALUE_LABEL_ANGLE } : {}),
      ...(trailingEdge
        ? {
            align: "right",
          }
        : {}),
    };
  };
}

/**
 * Estimates the vertical projection of the longest visible angled value. It
 * reserves only the space the formatted text needs, avoiding both clipping and
 * a permanently oversized empty band above short labels.
 */
export function chartValueLabelTopPadding(
  series: unknown[],
  unrotatedMinimum = 38,
  angledMinimum = 56,
) {
  const projection = maximumAngledValueLabelProjection(series);
  return projection.found
    ? Math.max(
        unrotatedMinimum,
        angledMinimum,
        Math.ceil(projection.vertical),
      )
    : unrotatedMinimum;
}

/** Reserves the horizontal projection required by angled labels near an edge. */
export function chartValueLabelRightPadding(
  series: unknown[],
  angledMinimum = 24,
) {
  const projection = maximumAngledValueLabelProjection(series);
  return projection.found
    ? Math.max(angledMinimum, Math.ceil(projection.horizontal))
    : 0;
}

function maximumAngledValueLabelProjection(series: unknown[]) {
  let horizontal = 0;
  let vertical = 0;
  let found = false;

  for (const item of series) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label =
      record.label && typeof record.label === "object"
        ? (record.label as Record<string, unknown>)
        : null;
    if (!label || label.show === false) continue;

    const rotation =
      typeof label.rotate === "number" && Number.isFinite(label.rotate)
        ? label.rotate
        : 0;
    const normalizedAngle = Math.abs(rotation % 180);
    if (normalizedAngle <= 0.001) continue;

    const fontSize = finitePositiveNumber(label.fontSize, 10);
    const distance = finitePositiveNumber(label.distance, 6);
    const data = Array.isArray(record.data) ? record.data : [];
    const radians = (normalizedAngle * Math.PI) / 180;

    data.forEach((value, dataIndex) => {
      if (dataLabelIsHidden(value)) return;
      const formatted = formatSeriesLabel(label.formatter, value, dataIndex);
      if (!formatted) return;
      const textWidth = estimatedTextWidth(formatted, fontSize);
      const lineCount = Math.max(1, formatted.split("\n").length);
      const textHeight = fontSize * 1.2 * lineCount;
      horizontal = Math.max(
        horizontal,
        textWidth * Math.cos(radians) +
          textHeight * Math.sin(radians) +
          distance +
          8,
      );
      vertical = Math.max(
        vertical,
        textWidth * Math.sin(radians) +
          textHeight * Math.cos(radians) +
          distance +
          8,
      );
      found = true;
    });
  }

  return { found, horizontal, vertical };
}

/** Returns the last data item that will actually render a numeric label. */
export function lastVisibleChartValueLabelIndex(series: unknown) {
  if (!series || typeof series !== "object") return -1;
  const record = series as Record<string, unknown>;
  const label =
    record.label && typeof record.label === "object"
      ? (record.label as Record<string, unknown>)
      : null;
  const data = Array.isArray(record.data) ? record.data : [];
  if (!label || label.show === false) return -1;

  for (let dataIndex = data.length - 1; dataIndex >= 0; dataIndex -= 1) {
    if (dataLabelIsHidden(data[dataIndex])) continue;
    if (formatSeriesLabel(label.formatter, data[dataIndex], dataIndex)) {
      return dataIndex;
    }
  }
  return -1;
}

function isLabelLayoutOption(value: unknown): value is LabelLayoutOption {
  return Boolean(
    typeof value === "function" ||
      (value && typeof value === "object" && !Array.isArray(value)),
  );
}

function finitePositiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function formatSeriesLabel(
  formatter: unknown,
  data: unknown,
  dataIndex: number,
) {
  const value = chartDataValue(data);
  if (typeof formatter === "function") {
    try {
      const formatted = formatter({ data, dataIndex, value });
      return typeof formatted === "string" || typeof formatted === "number"
        ? String(formatted)
        : "";
    } catch {
      // A specialized formatter may require runtime-only ECharts metadata.
      // The generic numeric representation remains a safe upper-bound input.
    }
  }

  const rawValue = Array.isArray(value) ? value[value.length - 1] : value;
  if (rawValue === null || rawValue === undefined || rawValue === "") return "";
  const numericValue =
    typeof rawValue === "number" ? rawValue : Number(String(rawValue));
  if (!Number.isFinite(numericValue)) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
    numericValue,
  );
}

function chartDataValue(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "value" in data
  ) {
    return (data as { value?: unknown }).value;
  }
  return data;
}

function dataLabelIsHidden(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const label = (data as { label?: unknown }).label;
  return Boolean(
    label &&
      typeof label === "object" &&
      (label as { show?: unknown }).show === false,
  );
}

function estimatedTextWidth(text: string, fontSize: number) {
  return text.split("\n").reduce((widest, line) => {
    const width = [...line].reduce((sum, character) => {
      if (/[\s.,:;|!']/u.test(character)) return sum + fontSize * 0.3;
      if (/[1ilI]/u.test(character)) return sum + fontSize * 0.38;
      if (/[MW@%]/u.test(character)) return sum + fontSize * 0.82;
      return sum + fontSize * 0.6;
    }, 0);
    return Math.max(widest, width);
  }, 0);
}
