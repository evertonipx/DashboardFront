import type { AggregateGranularity } from "@/lib/types";
import { getScopedStorageKey } from "@/lib/master-company-scope";

export type CustomAggregateChart = {
  id: string;
  name: string;
  granularity: AggregateGranularity;
  from: string;
  to: string;
  created_at: string;
};

const CUSTOM_AGGREGATE_CHARTS_KEY = "ipxdata.custom-aggregate-charts.v1";

export function loadCustomAggregateCharts(companyId?: string | null) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(
      getCustomAggregateChartsKey(companyId),
    );
    if (!stored) return [];

    const parsed = JSON.parse(stored) as CustomAggregateChart[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isCustomAggregateChart);
  } catch {
    return [];
  }
}

export function saveCustomAggregateCharts(
  charts: CustomAggregateChart[],
  companyId?: string | null,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getCustomAggregateChartsKey(companyId),
    JSON.stringify(charts.filter(isCustomAggregateChart)),
  );
}

function getCustomAggregateChartsKey(companyId?: string | null) {
  return getScopedStorageKey(CUSTOM_AGGREGATE_CHARTS_KEY, companyId);
}

function isCustomAggregateChart(value: unknown): value is CustomAggregateChart {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    isAggregateGranularity(record.granularity) &&
    typeof record.from === "string" &&
    typeof record.to === "string" &&
    typeof record.created_at === "string"
  );
}

function isAggregateGranularity(value: unknown): value is AggregateGranularity {
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
