"use client";

import { getScopedStorageKey } from "@/lib/master-company-scope";
import type { AggregateGranularity } from "@/lib/types";

export type ReportCustomWidgetGranularity = AggregateGranularity;
export type ReportCustomWidgetScopeMode = "scenario" | "location" | "sub_location";

export type ReportCustomWidget = {
  id: string;
  title: string;
  scopeId: string;
  scopeMode: ReportCustomWidgetScopeMode;
  scopeName: string;
  granularity: ReportCustomWidgetGranularity;
  created_at: string;
  updated_at: string;
};

export type ReportCustomWidgetInput = {
  id?: string;
  title: string;
  scopeId: string;
  scopeMode: ReportCustomWidgetScopeMode;
  scopeName: string;
  granularity: ReportCustomWidgetGranularity;
};

export const REPORT_CUSTOM_WIDGETS_UPDATED_EVENT =
  "ipxdata:report-custom-widgets-updated";

const REPORT_CUSTOM_WIDGETS_KEY = "ipxdata.report-custom-widgets.v1";

export function loadReportCustomWidgets(companyId?: string | null) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(getReportCustomWidgetsKey(companyId));
    if (!stored) return [];

    const parsed = JSON.parse(stored) as ReportCustomWidget[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isReportCustomWidget);
  } catch {
    return [];
  }
}

export function saveReportCustomWidgets(
  widgets: ReportCustomWidget[],
  companyId?: string | null,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getReportCustomWidgetsKey(companyId),
    JSON.stringify(widgets.filter(isReportCustomWidget)),
  );
  emitReportCustomWidgetsUpdated(companyId);
}

export function upsertReportCustomWidget(
  widget: ReportCustomWidgetInput,
  companyId?: string | null,
) {
  const widgets = loadReportCustomWidgets(companyId);
  const now = new Date().toISOString();
  const current = widget.id
    ? widgets.find((stored) => stored.id === widget.id)
    : undefined;
  const nextWidget: ReportCustomWidget = {
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

  saveReportCustomWidgets(nextWidgets, companyId);
  return nextWidgets;
}

export function deleteReportCustomWidget(
  widgetId: string,
  companyId?: string | null,
) {
  const nextWidgets = loadReportCustomWidgets(companyId).filter(
    (widget) => widget.id !== widgetId,
  );

  saveReportCustomWidgets(nextWidgets, companyId);
  return nextWidgets;
}

function getReportCustomWidgetsKey(companyId?: string | null) {
  return getScopedStorageKey(REPORT_CUSTOM_WIDGETS_KEY, companyId);
}

function emitReportCustomWidgetsUpdated(companyId?: string | null) {
  window.dispatchEvent(
    new CustomEvent(REPORT_CUSTOM_WIDGETS_UPDATED_EVENT, {
      detail: { companyId },
    }),
  );
}

function isReportCustomWidget(value: unknown): value is ReportCustomWidget {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.scopeId === "string" &&
    isReportCustomWidgetScopeMode(record.scopeMode) &&
    typeof record.scopeName === "string" &&
    isReportCustomWidgetGranularity(record.granularity) &&
    typeof record.created_at === "string" &&
    typeof record.updated_at === "string"
  );
}

function isReportCustomWidgetScopeMode(
  value: unknown,
): value is ReportCustomWidgetScopeMode {
  return (
    value === "scenario" || value === "location" || value === "sub_location"
  );
}

function isReportCustomWidgetGranularity(
  value: unknown,
): value is ReportCustomWidgetGranularity {
  return (
    value === "minute" ||
    value === "hour" ||
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "semester" ||
    value === "year"
  );
}

function createWidgetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `report-widget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
