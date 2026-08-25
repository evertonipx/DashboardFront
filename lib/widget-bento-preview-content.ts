export type WidgetBentoPreviewKind =
  | "metric"
  | "chart"
  | "heatmap"
  | "hex"
  | "list"
  | "table"
  | "ranking"
  | "composition"
  | "detail";

export type WidgetBentoPreviewChartType =
  | "bar"
  | "line"
  | "rose"
  | "treemap";

export type ResolveWidgetBentoPreviewKindInput = {
  chartType?: WidgetBentoPreviewChartType;
  chartTypeEnabled?: boolean;
  condensed?: boolean;
  defaultSize?: string;
  id: string;
  label?: string;
  previewKind?: WidgetBentoPreviewKind;
  zoomEnabled?: boolean;
};

/**
 * Resolves the widget's content silhouette independently from its current
 * dimensions. Resizing a KPI must not make it look like a generic detail card.
 * Callers with richer domain metadata can always provide an explicit kind.
 */
export function resolveWidgetBentoPreviewKind({
  chartType,
  chartTypeEnabled,
  condensed,
  defaultSize,
  id,
  label,
  previewKind,
  zoomEnabled,
}: ResolveWidgetBentoPreviewKindInput): WidgetBentoPreviewKind {
  if (previewKind) return previewKind;

  if (condensed || defaultSize === "compact") return "metric";
  if (chartType === "rose" || chartType === "treemap") {
    return "composition";
  }

  const idKind = resolveKnownIdentityKind(id);
  if (idKind) return idKind;
  if (chartType || chartTypeEnabled || zoomEnabled) return "chart";

  return resolveKnownIdentityKind(label ?? "") ?? "detail";
}

export function resolveWidgetBentoPreviewKindFromDataKind(
  kind: string,
): WidgetBentoPreviewKind {
  if (
    kind === "day_total" ||
    kind === "target_progress" ||
    kind === "cumulative_metric" ||
    kind === "metric"
  ) {
    return "metric";
  }
  if (kind === "heatmap") return "heatmap";
  if (kind === "totals_table" || kind === "table") return "table";
  if (kind === "ranking" || kind === "peak_days") return "ranking";
  if (kind === "rose") return "composition";
  if (kind === "hex") return "hex";
  if (kind === "alerts" || kind === "alert_list") return "list";
  if (kind === "summary" || kind === "detail") return "detail";
  return "chart";
}

function resolveKnownIdentityKind(
  value: string,
): Exclude<WidgetBentoPreviewKind, "metric" | "chart"> | undefined {
  const identity = value.toLocaleLowerCase("pt-BR");

  if (identity.includes("heatmap") || identity.includes("mapa de calor")) {
    return "heatmap";
  }
  if (
    identity.includes("rose") ||
    identity.includes("donut") ||
    identity.includes("composição") ||
    identity.includes("composicao")
  ) {
    return "composition";
  }
  if (
    identity.includes("ranking") ||
    identity.includes("peak_days") ||
    identity.includes("top 5") ||
    identity.includes("bar_race") ||
    identity.includes("bar race")
  ) {
    return "ranking";
  }
  if (
    identity.includes("table") ||
    identity.includes("tabela") ||
    identity.includes("matrix") ||
    identity.includes("matriz") ||
    identity.includes("totals_table")
  ) {
    return "table";
  }
  if (
    identity.includes("alert_list") ||
    identity.includes("histórico de alertas") ||
    identity.includes("historico de alertas")
  ) {
    return "list";
  }
  if (
    identity.includes("hex") ||
    identity.includes("scenario_detail") ||
    identity.includes("cenário de ocupação") ||
    identity.includes("cenario de ocupacao") ||
    identity.includes("summary") ||
    identity.includes("resumo")
  ) {
    return identity.includes("hex") ? "hex" : "detail";
  }
  return undefined;
}
