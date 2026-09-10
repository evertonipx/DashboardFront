import {
  AGE_LABELS,
  DEMOGRAPHIC_GENDERS,
  DEMOGRAPHIC_GENDER_DISPLAY_LABELS,
  EMOTION_LABELS,
  DEMOGRAPHIC_EMOTION_DISPLAY_LABELS,
} from "@/lib/demographics";
import { getDemographicPalette, type DemographicPaletteId } from "@/lib/demographics-presentation";

export const DEMOGRAPHICS_TEMPORAL_WIDGET_IDS = [
  "demographics_gender_timeline",
  "demographics_emotion_hourly",
  "demographics_age_hourly",
  "demographics_daily_evolution",
  "demographics_period_comparison",
] as const;

export type DemographicTemporalWidgetId = (typeof DEMOGRAPHICS_TEMPORAL_WIDGET_IDS)[number];
export type DemographicTemporalDimension = "gender" | "age" | "emotion";
export type DemographicTemporalSettings = {
  dimension: DemographicTemporalDimension;
  metric: "percentage" | "count";
  granularity: "auto" | "hour" | "day" | "month";
  chartType: "bar" | "area" | "line" | "heatmap";
  categoryKeys: string[];
  palette: DemographicPaletteId;
  comparison?: "previous-period" | "previous-week" | "previous-month";
};

export function isDemographicTemporalWidgetId(value: unknown): value is DemographicTemporalWidgetId {
  return DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.some((id) => id === value);
}

export function isDemographicHourlyProfile(widgetId: DemographicTemporalWidgetId) {
  return widgetId === "demographics_emotion_hourly" || widgetId === "demographics_age_hourly";
}

export function defaultDemographicTemporalSettings(widgetId: DemographicTemporalWidgetId): DemographicTemporalSettings {
  const hourly = isDemographicHourlyProfile(widgetId);
  const comparison = widgetId === "demographics_period_comparison";
  return {
    dimension: widgetId === "demographics_emotion_hourly" ? "emotion" : widgetId === "demographics_age_hourly" ? "age" : "gender",
    metric: "percentage",
    granularity: hourly ? "hour" : widgetId === "demographics_daily_evolution" ? "day" : "auto",
    chartType: hourly ? "heatmap" : widgetId === "demographics_gender_timeline" ? "area" : comparison ? "bar" : "line",
    categoryKeys: [],
    palette: "pink-blue",
    ...(comparison ? { comparison: "previous-period" as const } : {}),
  };
}

export function demographicTemporalCategories(dimension: DemographicTemporalDimension): Array<{ key: string; label: string }> {
  if (dimension === "gender") return DEMOGRAPHIC_GENDERS.map((key) => ({ key, label: DEMOGRAPHIC_GENDER_DISPLAY_LABELS[key] }));
  if (dimension === "emotion") return EMOTION_LABELS.map((key) => ({ key, label: DEMOGRAPHIC_EMOTION_DISPLAY_LABELS[key] }));
  return AGE_LABELS.map((key) => ({ key, label: key }));
}

export function normalizeDemographicTemporalSettings(value: unknown, widgetId: DemographicTemporalWidgetId): DemographicTemporalSettings {
  const defaults = defaultDemographicTemporalSettings(widgetId);
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const dimension = stored.dimension === "gender" || stored.dimension === "age" || stored.dimension === "emotion" ? stored.dimension : defaults.dimension;
  // Canonical keys (never visual indices) bind the selection to its dimension.
  const requestedKeys = new Set(Array.isArray(stored.categoryKeys) ? stored.categoryKeys.filter((key): key is string => typeof key === "string") : []);
  const categories = demographicTemporalCategories(dimension);
  const selected = categories.filter(({ key }) => requestedKeys.has(key)).map(({ key }) => key);
  return {
    dimension,
    metric: stored.metric === "percentage" || stored.metric === "count" ? stored.metric : defaults.metric,
    granularity: isDemographicHourlyProfile(widgetId) ? "hour" : widgetId === "demographics_period_comparison" ? "auto"
      : stored.granularity === "auto" || stored.granularity === "hour" || stored.granularity === "day" || stored.granularity === "month" ? stored.granularity : defaults.granularity,
    chartType: stored.chartType === "bar" || stored.chartType === "area" || stored.chartType === "line" || stored.chartType === "heatmap" ? stored.chartType : defaults.chartType,
    // Empty is the persisted representation of all categories, including an
    // explicit selection of every category. Filtering never changes the base
    // used to calculate percentages in the chart/model layer.
    categoryKeys: selected.length === categories.length ? [] : selected,
    palette: getDemographicPalette(stored.palette).id,
    ...(widgetId === "demographics_period_comparison" ? {
      comparison: stored.comparison === "previous-period" || stored.comparison === "previous-week" || stored.comparison === "previous-month"
        ? stored.comparison : "previous-period",
    } : {}),
  };
}
