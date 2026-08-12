"use client";

import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";

export type OccupancyCustomWidgetGranularity =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month";

export type OccupancyCustomMetric =
  | "current"
  | "average"
  | "minimum"
  | "peak"
  | "alerts"
  | "active_areas"
  | "utilization";

export type OccupancyTrendSeries = {
  average: boolean;
  minimum: boolean;
  peak: boolean;
};

type OccupancyCustomWidgetBase = {
  created_at: string;
  id: string;
  title: string;
  updated_at: string;
};

export type OccupancyMetricCustomWidget = OccupancyCustomWidgetBase & {
  kind: "metric";
  metric: OccupancyCustomMetric;
};

export type OccupancyTrendCustomWidget = OccupancyCustomWidgetBase & {
  granularity: OccupancyCustomWidgetGranularity;
  kind: "trend";
  series: OccupancyTrendSeries;
};

export type OccupancyCustomWidget =
  | OccupancyMetricCustomWidget
  | OccupancyTrendCustomWidget;

type OccupancyCustomWidgetInputBase = {
  id?: string;
  title: string;
};

export type OccupancyMetricCustomWidgetInput =
  OccupancyCustomWidgetInputBase & {
    kind: "metric";
    metric: OccupancyCustomMetric;
  };

export type OccupancyTrendCustomWidgetInput =
  OccupancyCustomWidgetInputBase & {
    granularity: OccupancyCustomWidgetGranularity;
    kind: "trend";
    series: OccupancyTrendSeries;
  };

export type OccupancyCustomWidgetInput =
  | OccupancyMetricCustomWidgetInput
  | OccupancyTrendCustomWidgetInput;

export type OccupancyCustomWidgetScope = {
  userId?: string | null;
  viewId?: string | null;
};

export const OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT =
  "ipxdata:occupancy-custom-widgets-updated";
export const OCCUPANCY_CUSTOM_WIDGETS_KEY =
  "ipxdata.occupancy-custom-widgets.v1";

export const DEFAULT_OCCUPANCY_TREND_SERIES: OccupancyTrendSeries = {
  average: true,
  minimum: true,
  peak: true,
};

export function loadOccupancyCustomWidgets(
  companyId?: string | null,
  scope: OccupancyCustomWidgetScope = {},
) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(
      getOccupancyCustomWidgetsKey(companyId, scope),
    );
    return stored
      ? normalizeOccupancyCustomWidgets(JSON.parse(stored) as unknown)
      : [];
  } catch {
    return [];
  }
}

export function saveOccupancyCustomWidgets(
  widgets: OccupancyCustomWidget[],
  companyId?: string | null,
  scope: OccupancyCustomWidgetScope = {},
) {
  const normalized = normalizeOccupancyCustomWidgets(widgets);
  if (typeof window === "undefined") return normalized;

  window.localStorage.setItem(
    getOccupancyCustomWidgetsKey(companyId, scope),
    JSON.stringify(normalized),
  );
  emitOccupancyCustomWidgetsUpdated(companyId, scope);
  return normalized;
}

export function upsertOccupancyCustomWidget(
  input: OccupancyCustomWidgetInput,
  companyId?: string | null,
  scope: OccupancyCustomWidgetScope = {},
) {
  const title = input.title.trim();
  if (!title) throw new Error("O título do widget é obrigatório.");

  const widgets = loadOccupancyCustomWidgets(companyId, scope);
  const current = input.id
    ? widgets.find((widget) => widget.id === input.id)
    : undefined;
  const now = new Date().toISOString();
  const base = {
    created_at: current?.created_at ?? now,
    id: current?.id ?? createOccupancyWidgetId(),
    title,
    updated_at: now,
  };
  const widget: OccupancyCustomWidget =
    input.kind === "metric"
      ? { ...base, kind: "metric", metric: input.metric }
      : {
          ...base,
          granularity: input.granularity,
          kind: "trend",
          series: normalizeTrendSeries(input.series),
        };
  const next = current
    ? widgets.map((stored) => (stored.id === current.id ? widget : stored))
    : [...widgets, widget];

  return saveOccupancyCustomWidgets(next, companyId, scope);
}

export function deleteOccupancyCustomWidget(
  widgetId: string,
  companyId?: string | null,
  scope: OccupancyCustomWidgetScope = {},
) {
  return saveOccupancyCustomWidgets(
    loadOccupancyCustomWidgets(companyId, scope).filter(
      (widget) => widget.id !== widgetId,
    ),
    companyId,
    scope,
  );
}

export function normalizeOccupancyCustomWidgets(
  value: unknown,
): OccupancyCustomWidget[] {
  if (!Array.isArray(value)) return [];

  const widgets = new Map<string, OccupancyCustomWidget>();
  for (const candidate of value) {
    const normalized = normalizeOccupancyCustomWidget(candidate);
    if (normalized) widgets.set(normalized.id, normalized);
  }
  return Array.from(widgets.values());
}

export function getOccupancyCustomWidgetsKey(
  companyId?: string | null,
  scope: OccupancyCustomWidgetScope = {},
) {
  return getUserViewScopedStorageKey(
    OCCUPANCY_CUSTOM_WIDGETS_KEY,
    companyId,
    scope.userId,
    scope.viewId,
  );
}

function normalizeOccupancyCustomWidget(
  value: unknown,
): OccupancyCustomWidget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = cleanString(record.id);
  const title = cleanString(record.title);
  const createdAt = cleanString(record.created_at);
  const updatedAt = cleanString(record.updated_at);
  if (!id || !title || !createdAt || !updatedAt) return null;

  const base = {
    created_at: createdAt,
    id,
    title,
    updated_at: updatedAt,
  };
  if (
    (record.kind === "metric" || record.kind === "kpi") &&
    isOccupancyCustomMetric(record.metric)
  ) {
    return { ...base, kind: "metric", metric: record.metric };
  }
  if (
    record.kind === "trend" &&
    isOccupancyCustomWidgetGranularity(record.granularity)
  ) {
    return {
      ...base,
      granularity: record.granularity,
      kind: "trend",
      series: normalizeTrendSeries(record.series),
    };
  }
  return null;
}

function normalizeTrendSeries(value: unknown): OccupancyTrendSeries {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    average:
      typeof record.average === "boolean"
        ? record.average
        : DEFAULT_OCCUPANCY_TREND_SERIES.average,
    minimum:
      typeof record.minimum === "boolean"
        ? record.minimum
        : DEFAULT_OCCUPANCY_TREND_SERIES.minimum,
    peak:
      typeof record.peak === "boolean"
        ? record.peak
        : DEFAULT_OCCUPANCY_TREND_SERIES.peak,
  };
}

function isOccupancyCustomMetric(
  value: unknown,
): value is OccupancyCustomMetric {
  return (
    value === "current" ||
    value === "average" ||
    value === "minimum" ||
    value === "peak" ||
    value === "alerts" ||
    value === "active_areas" ||
    value === "utilization"
  );
}

function isOccupancyCustomWidgetGranularity(
  value: unknown,
): value is OccupancyCustomWidgetGranularity {
  return (
    value === "minute" ||
    value === "hour" ||
    value === "day" ||
    value === "week" ||
    value === "month"
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function emitOccupancyCustomWidgetsUpdated(
  companyId?: string | null,
  scope: OccupancyCustomWidgetScope = {},
) {
  window.dispatchEvent(
    new CustomEvent(OCCUPANCY_CUSTOM_WIDGETS_UPDATED_EVENT, {
      detail: { companyId, userId: scope.userId, viewId: scope.viewId },
    }),
  );
}

function createOccupancyWidgetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `occupancy-widget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
