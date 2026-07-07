"use client";

import { getScopedStorageKey } from "@/lib/master-company-scope";
import type { AggregateGranularity } from "@/lib/types";

export type RealtimeCustomWidgetGranularity = Extract<
  AggregateGranularity,
  "minute" | "hour" | "day" | "week" | "month"
>;

export type RealtimeCustomWidgetScopeMode =
  | "scenario"
  | "location"
  | "sub_location";

export type RealtimeCustomWidget = {
  id: string;
  title: string;
  scopeId: string;
  scopeMode: RealtimeCustomWidgetScopeMode;
  scopeName: string;
  granularity: RealtimeCustomWidgetGranularity;
  created_at: string;
  updated_at: string;
};

export type RealtimeCustomWidgetInput = {
  id?: string;
  title: string;
  scopeId: string;
  scopeMode: RealtimeCustomWidgetScopeMode;
  scopeName: string;
  granularity: RealtimeCustomWidgetGranularity;
};

export const REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT =
  "ipxdata:realtime-custom-widgets-updated";

const REALTIME_CUSTOM_WIDGETS_KEY = "ipxdata.realtime-custom-widgets.v1";

export function loadRealtimeCustomWidgets(companyId?: string | null) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(
      getRealtimeCustomWidgetsKey(companyId),
    );
    if (!stored) return [];

    const parsed = JSON.parse(stored) as RealtimeCustomWidget[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isRealtimeCustomWidget);
  } catch {
    return [];
  }
}

export function saveRealtimeCustomWidgets(
  widgets: RealtimeCustomWidget[],
  companyId?: string | null,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getRealtimeCustomWidgetsKey(companyId),
    JSON.stringify(widgets.filter(isRealtimeCustomWidget)),
  );
  emitRealtimeCustomWidgetsUpdated(companyId);
}

export function upsertRealtimeCustomWidget(
  widget: RealtimeCustomWidgetInput,
  companyId?: string | null,
) {
  const widgets = loadRealtimeCustomWidgets(companyId);
  const now = new Date().toISOString();
  const current = widget.id
    ? widgets.find((stored) => stored.id === widget.id)
    : undefined;
  const nextWidget: RealtimeCustomWidget = {
    id: widget.id || createWidgetId(),
    title: widget.title,
    scopeId: widget.scopeId,
    scopeMode: widget.scopeMode,
    scopeName: widget.scopeName,
    granularity: widget.granularity,
    created_at: current?.created_at ?? now,
    updated_at: now,
  };
  const nextWidgets = current
    ? widgets.map((stored) =>
        stored.id === nextWidget.id ? nextWidget : stored,
      )
    : [...widgets, nextWidget];

  saveRealtimeCustomWidgets(nextWidgets, companyId);
  return nextWidgets;
}

export function deleteRealtimeCustomWidget(
  widgetId: string,
  companyId?: string | null,
) {
  const nextWidgets = loadRealtimeCustomWidgets(companyId).filter(
    (widget) => widget.id !== widgetId,
  );

  saveRealtimeCustomWidgets(nextWidgets, companyId);
  return nextWidgets;
}

function getRealtimeCustomWidgetsKey(companyId?: string | null) {
  return getScopedStorageKey(REALTIME_CUSTOM_WIDGETS_KEY, companyId);
}

function emitRealtimeCustomWidgetsUpdated(companyId?: string | null) {
  window.dispatchEvent(
    new CustomEvent(REALTIME_CUSTOM_WIDGETS_UPDATED_EVENT, {
      detail: { companyId },
    }),
  );
}

function isRealtimeCustomWidget(value: unknown): value is RealtimeCustomWidget {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.scopeId === "string" &&
    isRealtimeCustomWidgetScopeMode(record.scopeMode) &&
    typeof record.scopeName === "string" &&
    isRealtimeCustomWidgetGranularity(record.granularity) &&
    typeof record.created_at === "string" &&
    typeof record.updated_at === "string"
  );
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
