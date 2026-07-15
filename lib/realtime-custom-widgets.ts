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

export type RealtimeCustomWidgetKind = "scope" | "scenario_comparison";

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

export type RealtimeCustomWidget =
  | RealtimeScopeCustomWidget
  | RealtimeScenarioComparisonWidget;

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

export type RealtimeCustomWidgetInput =
  | RealtimeScopeCustomWidgetInput
  | RealtimeScenarioComparisonWidgetInput;

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

    const parsed = JSON.parse(stored) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeRealtimeCustomWidget)
      .filter((widget): widget is RealtimeCustomWidget => Boolean(widget));
  } catch {
    return [];
  }
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
  const nextWidget: RealtimeCustomWidget =
    widget.kind === "scenario_comparison"
      ? { ...base, kind: "scenario_comparison" }
      : {
          ...base,
          kind: "scope",
          scopeId: widget.scopeId,
          scopeMode: widget.scopeMode,
          scopeName: widget.scopeName,
          granularity: widget.granularity,
        };
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

function createWidgetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `live-widget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
