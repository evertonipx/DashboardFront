"use client";

import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import type { AggregateGranularity } from "@/lib/types";

export type RealtimeCustomWidgetGranularity = Extract<
  AggregateGranularity,
  "minute" | "hour" | "day" | "week" | "month"
>;

export type RealtimeCustomWidgetScopeMode =
  | "scenario"
  | "location"
  | "sub_location";

export type RealtimeScenarioWidgetType =
  | "ranking"
  | "peak_days"
  | "heatmap"
  | "cumulative"
  | "totals_table"
  | "rose";

export type RealtimeCustomWidgetKind =
  | "scope"
  | "scenario_comparison"
  | "scenario_widget";

type RealtimeCustomWidgetBase = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type RealtimeScopeCustomWidget = RealtimeCustomWidgetBase & {
  kind: "scope";
  scopeId: string;
  scopeMode: RealtimeCustomWidgetScopeMode;
  scopeName: string;
  granularity: RealtimeCustomWidgetGranularity;
};

export type RealtimeScenarioComparisonWidget = RealtimeCustomWidgetBase & {
  kind: "scenario_comparison";
};

export type RealtimeScenarioCustomWidget = RealtimeCustomWidgetBase & {
  kind: "scenario_widget";
  scenarioIds: string[];
  selectionMode: "all" | "custom";
  widgetType: RealtimeScenarioWidgetType;
};

export type RealtimeCustomWidget =
  | RealtimeScopeCustomWidget
  | RealtimeScenarioComparisonWidget
  | RealtimeScenarioCustomWidget;

type RealtimeCustomWidgetInputBase = {
  id?: string;
  title: string;
};

export type RealtimeScopeCustomWidgetInput = RealtimeCustomWidgetInputBase & {
  kind: "scope";
  scopeId: string;
  scopeMode: RealtimeCustomWidgetScopeMode;
  scopeName: string;
  granularity: RealtimeCustomWidgetGranularity;
};

export type RealtimeScenarioComparisonWidgetInput =
  RealtimeCustomWidgetInputBase & {
    kind: "scenario_comparison";
  };

export type RealtimeScenarioCustomWidgetInput = RealtimeCustomWidgetInputBase & {
  kind: "scenario_widget";
  scenarioIds: string[];
  selectionMode: "all" | "custom";
  widgetType: RealtimeScenarioWidgetType;
};

export type RealtimeCustomWidgetInput =
  | RealtimeScopeCustomWidgetInput
  | RealtimeScenarioComparisonWidgetInput
  | RealtimeScenarioCustomWidgetInput;

export const REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT =
  "ipxdata:realtime-custom-widgets-updated";

const REALTIME_CUSTOM_WIDGETS_KEY = "ipxdata.realtime-custom-widgets.v1";

export function loadRealtimeCustomWidgets(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(
      getRealtimeCustomWidgetsKey(companyId, scope),
    );
    if (!stored) return [];

    return normalizeRealtimeCustomWidgets(JSON.parse(stored) as unknown);
  } catch {
    return [];
  }
}

export function normalizeRealtimeCustomWidgets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeRealtimeCustomWidget)
    .filter((widget): widget is RealtimeCustomWidget => Boolean(widget));
}

export function saveRealtimeCustomWidgets(
  widgets: RealtimeCustomWidget[],
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getRealtimeCustomWidgetsKey(companyId, scope),
    JSON.stringify(widgets.filter(isRealtimeCustomWidget)),
  );
  emitRealtimeCustomWidgetsUpdated(companyId, scope);
}

export function upsertRealtimeCustomWidget(
  widget: RealtimeCustomWidgetInput,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  const widgets = loadRealtimeCustomWidgets(companyId, scope);
  const now = new Date().toISOString();
  const current = widget.id
    ? widgets.find((stored) => stored.id === widget.id)
    : undefined;
  const base = {
    id: widget.id || createWidgetId(),
    title: widget.title,
    created_at: current?.created_at ?? now,
    updated_at: now,
  };
  let nextWidget: RealtimeCustomWidget;
  if (widget.kind === "scenario_comparison") {
    nextWidget = { ...base, kind: "scenario_comparison" };
  } else if (widget.kind === "scenario_widget") {
    nextWidget = {
      ...base,
      kind: "scenario_widget",
      scenarioIds: normalizeIds(widget.scenarioIds),
      selectionMode: widget.selectionMode === "custom" ? "custom" : "all",
      widgetType: widget.widgetType,
    };
  } else {
    nextWidget = {
          ...base,
          kind: "scope",
          scopeId: widget.scopeId,
          scopeMode: widget.scopeMode,
          scopeName: widget.scopeName,
          granularity: widget.granularity,
        };
  }
  const nextWidgets = current
    ? widgets.map((stored) =>
        stored.id === nextWidget.id ? nextWidget : stored,
      )
    : [...widgets, nextWidget];

  saveRealtimeCustomWidgets(nextWidgets, companyId, scope);
  return nextWidgets;
}

export function deleteRealtimeCustomWidget(
  widgetId: string,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  const nextWidgets = loadRealtimeCustomWidgets(companyId, scope).filter(
    (widget) => widget.id !== widgetId,
  );

  saveRealtimeCustomWidgets(nextWidgets, companyId, scope);
  return nextWidgets;
}

function getRealtimeCustomWidgetsKey(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  return getUserViewScopedStorageKey(
    REALTIME_CUSTOM_WIDGETS_KEY,
    companyId,
    scope.userId,
    scope.viewId,
  );
}

function emitRealtimeCustomWidgetsUpdated(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  window.dispatchEvent(
    new CustomEvent(REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT, {
      detail: { companyId, userId: scope.userId, viewId: scope.viewId },
    }),
  );
}

function isRealtimeCustomWidget(value: unknown): value is RealtimeCustomWidget {
  return Boolean(normalizeRealtimeCustomWidget(value));
}

function normalizeRealtimeCustomWidget(
  value: unknown,
): RealtimeCustomWidget | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.title !== "string" ||
    typeof record.created_at !== "string" ||
    typeof record.updated_at !== "string"
  ) {
    return null;
  }

  const base = {
    id: record.id,
    title: record.title,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };

  if (record.kind === "scenario_comparison") {
    return { ...base, kind: "scenario_comparison" };
  }

  if (
    record.kind === "scenario_widget" &&
    isRealtimeScenarioWidgetType(record.widgetType)
  ) {
    return {
      ...base,
      kind: "scenario_widget",
      scenarioIds: normalizeIds(record.scenarioIds),
      selectionMode: record.selectionMode === "custom" ? "custom" : "all",
      widgetType: record.widgetType,
    };
  }

  if (
    (record.kind === undefined || record.kind === "scope") &&
    typeof record.scopeId === "string" &&
    isRealtimeCustomWidgetScopeMode(record.scopeMode) &&
    typeof record.scopeName === "string" &&
    isRealtimeCustomWidgetGranularity(record.granularity)
  ) {
    return {
      ...base,
      kind: "scope",
      scopeId: record.scopeId,
      scopeMode: record.scopeMode,
      scopeName: record.scopeName,
      granularity: record.granularity,
    };
  }

  return null;
}

function isRealtimeCustomWidgetScopeMode(
  value: unknown,
): value is RealtimeCustomWidgetScopeMode {
  return (
    value === "scenario" || value === "location" || value === "sub_location"
  );
}

function isRealtimeCustomWidgetGranularity(
  value: unknown,
): value is RealtimeCustomWidgetGranularity {
  return (
    value === "minute" ||
    value === "hour" ||
    value === "day" ||
    value === "week" ||
    value === "month"
  );
}

function isRealtimeScenarioWidgetType(
  value: unknown,
): value is RealtimeScenarioWidgetType {
  return (
    value === "ranking" ||
    value === "peak_days" ||
    value === "heatmap" ||
    value === "cumulative" ||
    value === "totals_table" ||
    value === "rose"
  );
}

function normalizeIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (id): id is string => typeof id === "string" && Boolean(id.trim()),
          ),
        ),
      )
    : [];
}

function createWidgetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `live-widget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
