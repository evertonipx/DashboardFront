"use client";

import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import type { ViewPreferenceScope } from "@/lib/counting-report-view-settings";
import type { AggregateGranularity } from "@/lib/types";

export type ReportCustomWidgetGranularity = AggregateGranularity;
export type ReportCustomWidgetScopeMode = "scenario" | "location" | "sub_location";
export type ReportCustomWidgetKind = "scope" | "scenario_comparison";

type ReportCustomWidgetBase = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ReportScopeCustomWidget = ReportCustomWidgetBase & {
  kind: "scope";
  scopeId: string;
  scopeMode: ReportCustomWidgetScopeMode;
  scopeName: string;
  granularity: ReportCustomWidgetGranularity;
};

export type ReportScenarioComparisonWidget = ReportCustomWidgetBase & {
  kind: "scenario_comparison";
};

export type ReportCustomWidget =
  | ReportScopeCustomWidget
  | ReportScenarioComparisonWidget;

type ReportCustomWidgetInputBase = {
  id?: string;
  title: string;
};

export type ReportScopeCustomWidgetInput = ReportCustomWidgetInputBase & {
  kind: "scope";
  scopeId: string;
  scopeMode: ReportCustomWidgetScopeMode;
  scopeName: string;
  granularity: ReportCustomWidgetGranularity;
};

export type ReportScenarioComparisonWidgetInput = ReportCustomWidgetInputBase & {
  kind: "scenario_comparison";
};

export type ReportCustomWidgetInput =
  | ReportScopeCustomWidgetInput
  | ReportScenarioComparisonWidgetInput;

export const REPORT_CUSTOM_WIDGETS_UPDATED_EVENT =
  "ipxdata:report-custom-widgets-updated";

const REPORT_CUSTOM_WIDGETS_KEY = "ipxdata.report-custom-widgets.v1";

export function loadReportCustomWidgets(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(
      getReportCustomWidgetsKey(companyId, scope),
    );
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeReportCustomWidget)
      .filter((widget): widget is ReportCustomWidget => Boolean(widget));
  } catch {
    return [];
  }
}

export function saveReportCustomWidgets(
  widgets: ReportCustomWidget[],
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getReportCustomWidgetsKey(companyId, scope),
    JSON.stringify(widgets.filter(isReportCustomWidget)),
  );
  emitReportCustomWidgetsUpdated(companyId, scope);
}

export function upsertReportCustomWidget(
  widget: ReportCustomWidgetInput,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  const widgets = loadReportCustomWidgets(companyId, scope);
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
  const nextWidget: ReportCustomWidget =
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

  saveReportCustomWidgets(nextWidgets, companyId, scope);
  return nextWidgets;
}

export function deleteReportCustomWidget(
  widgetId: string,
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  const nextWidgets = loadReportCustomWidgets(companyId, scope).filter(
    (widget) => widget.id !== widgetId,
  );

  saveReportCustomWidgets(nextWidgets, companyId, scope);
  return nextWidgets;
}

function getReportCustomWidgetsKey(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  return getUserViewScopedStorageKey(
    REPORT_CUSTOM_WIDGETS_KEY,
    companyId,
    scope.userId,
    scope.viewId,
  );
}

function emitReportCustomWidgetsUpdated(
  companyId?: string | null,
  scope: ViewPreferenceScope = {},
) {
  window.dispatchEvent(
    new CustomEvent(REPORT_CUSTOM_WIDGETS_UPDATED_EVENT, {
      detail: { companyId, userId: scope.userId, viewId: scope.viewId },
    }),
  );
}

function isReportCustomWidget(value: unknown): value is ReportCustomWidget {
  return Boolean(normalizeReportCustomWidget(value));
}

function normalizeReportCustomWidget(value: unknown): ReportCustomWidget | null {
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
    isReportCustomWidgetScopeMode(record.scopeMode) &&
    typeof record.scopeName === "string" &&
    isReportCustomWidgetGranularity(record.granularity)
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
