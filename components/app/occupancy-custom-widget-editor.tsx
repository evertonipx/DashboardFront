"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";

import { WidgetCardActions } from "@/components/app/widget-card-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_OCCUPANCY_TREND_SERIES,
  type OccupancyCustomMetric,
  type OccupancyCustomWidgetGranularity,
  type OccupancyTrendSeries,
} from "@/lib/occupancy-custom-widgets";

export type OccupancyCustomWidgetForm = {
  granularity: OccupancyCustomWidgetGranularity;
  id?: string;
  kind: "metric" | "trend";
  metric: OccupancyCustomMetric;
  series: OccupancyTrendSeries;
  title: string;
};

export type OccupancyCustomMetricOption = {
  label: string;
  value: OccupancyCustomMetric;
};

export type OccupancyGranularityOption = {
  label: string;
  value: OccupancyCustomWidgetGranularity;
};

export const DEFAULT_OCCUPANCY_CUSTOM_WIDGET_FORM: OccupancyCustomWidgetForm = {
  granularity: "hour",
  kind: "metric",
  metric: "current",
  series: DEFAULT_OCCUPANCY_TREND_SERIES,
  title: "Ocupação atual",
};

export const OCCUPANCY_CUSTOM_METRIC_OPTIONS: OccupancyCustomMetricOption[] = [
  { label: "Ocupação atual", value: "current" },
  { label: "Média de hoje", value: "average" },
  { label: "Mínimo de hoje", value: "minimum" },
  { label: "Máximo de hoje", value: "peak" },
  { label: "Alertas recentes", value: "alerts" },
  { label: "Áreas ocupadas", value: "active_areas" },
  { label: "Utilização da capacidade", value: "utilization" },
];

export const OCCUPANCY_GRANULARITY_OPTIONS: OccupancyGranularityOption[] = [
  { label: "Últimos 60 minutos", value: "minute" },
  { label: "Hoje por hora", value: "hour" },
  { label: "Últimos 7 dias", value: "day" },
  { label: "Últimas 8 semanas", value: "week" },
  { label: "Últimos 12 meses", value: "month" },
];

const OCCUPANCY_ANALYSIS_CUSTOM_METRIC_OPTIONS: OccupancyCustomMetricOption[] = [
  { label: "Última ocupação do período", value: "current" },
  { label: "Média do período", value: "average" },
  { label: "Mínimo do período", value: "minimum" },
  { label: "Máximo do período", value: "peak" },
  { label: "Áreas ocupadas no fim do período", value: "active_areas" },
  { label: "Utilização no fim do período", value: "utilization" },
];

const OCCUPANCY_ANALYSIS_GRANULARITY_OPTIONS: OccupancyGranularityOption[] = [
  { label: "Último dia por minuto", value: "minute" },
  { label: "Último dia por hora", value: "hour" },
  { label: "Período com consolidação automática", value: "day" },
  { label: "Tendência semanal do período", value: "week" },
  { label: "Tendência mensal do período", value: "month" },
];

export function occupancyCustomMetricLabel(metric: OccupancyCustomMetric) {
  return (
    OCCUPANCY_CUSTOM_METRIC_OPTIONS.find((option) => option.value === metric)
      ?.label ?? "Indicador de ocupação"
  );
}

export function occupancyGranularityLabel(
  granularity: OccupancyCustomWidgetGranularity,
) {
  return (
    OCCUPANCY_GRANULARITY_OPTIONS.find(
      (option) => option.value === granularity,
    )?.label.toLowerCase() ?? "histórica"
  );
}

export function OccupancyCustomWidgetDialog({
  form,
  onChange,
  onOpenChange,
  onSave,
  open,
  surface = "live",
}: {
  form: OccupancyCustomWidgetForm;
  onChange: React.Dispatch<React.SetStateAction<OccupancyCustomWidgetForm>>;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
  surface?: "analysis" | "live";
}) {
  const granularitySelectId = React.useId();
  const kindSelectId = React.useId();
  const metricSelectId = React.useId();
  const seriesLabelId = React.useId();
  const metricOptions =
    surface === "analysis"
      ? OCCUPANCY_ANALYSIS_CUSTOM_METRIC_OPTIONS
      : OCCUPANCY_CUSTOM_METRIC_OPTIONS;
  const granularityOptions =
    surface === "analysis"
      ? OCCUPANCY_ANALYSIS_GRANULARITY_OPTIONS
      : OCCUPANCY_GRANULARITY_OPTIONS;
  const metricLabel = (metric: OccupancyCustomMetric) =>
    metricOptions.find((option) => option.value === metric)?.label ??
    occupancyCustomMetricLabel(metric);
  const granularityLabel = (
    granularity: OccupancyCustomWidgetGranularity,
  ) =>
    granularityOptions
      .find((option) => option.value === granularity)
      ?.label.toLowerCase() ?? occupancyGranularityLabel(granularity);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Editar widget de ocupação" : "Novo widget de ocupação"}
          </DialogTitle>
          <DialogDescription>
            {surface === "analysis"
              ? "Monte indicadores e tendências sobre o intervalo consultado. Cada cenário mantém seu próprio conjunto de widgets."
              : "Monte indicadores e tendências usando os mesmos dados do cenário selecionado. Cada cenário mantém seu próprio conjunto de widgets."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={kindSelectId}>Tipo de widget</Label>
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  onChange((current) => {
                    const kind = value as OccupancyCustomWidgetForm["kind"];
                    return {
                      ...current,
                      kind,
                      title: current.id
                        ? current.title
                        : kind === "metric"
                          ? metricLabel(current.metric)
                          : `Tendência ${granularityLabel(current.granularity)}`,
                    };
                  })
                }
              >
                <SelectTrigger id={kindSelectId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">Indicador operacional</SelectItem>
                  <SelectItem value="trend">Tendência histórica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupancy-custom-widget-title">Título</Label>
              <Input
                id="occupancy-custom-widget-title"
                value={form.title}
                maxLength={120}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Nome do widget"
              />
            </div>
          </div>

          {form.kind === "metric" ? (
            <div className="space-y-2 rounded-md border bg-muted/15 p-3">
              <Label htmlFor={metricSelectId}>Indicador</Label>
              <Select
                value={form.metric}
                onValueChange={(value) =>
                  onChange((current) => ({
                    ...current,
                    metric: value as OccupancyCustomMetric,
                    title: current.id
                      ? current.title
                      : metricLabel(
                          value as OccupancyCustomMetric,
                        ),
                  }))
                }
              >
                <SelectTrigger id={metricSelectId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {surface === "analysis" && form.metric === "alerts" ? (
                    <SelectItem value="alerts" disabled>
                      Alertas recentes · disponível somente no Ao Vivo
                    </SelectItem>
                  ) : null}
                  {metricOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Utilização usa a capacidade configurada no simulador hexagonal;
                sem capacidade o valor permanece indisponível.
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-md border bg-muted/15 p-3">
              <div className="space-y-2">
                <Label htmlFor={granularitySelectId}>Período e agrupamento</Label>
                <Select
                  value={form.granularity}
                  onValueChange={(value) =>
                    onChange((current) => ({
                      ...current,
                      granularity: value as OccupancyCustomWidgetGranularity,
                      title: current.id
                        ? current.title
                        : `Tendência ${granularityLabel(
                            value as OccupancyCustomWidgetGranularity,
                          )}`,
                    }))
                  }
                >
                  <SelectTrigger id={granularitySelectId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {granularityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p id={seriesLabelId} className="text-sm font-medium leading-none">
                  Séries exibidas
                </p>
                <div
                  aria-labelledby={seriesLabelId}
                  className="flex flex-wrap gap-2"
                  role="group"
                >
                  <Badge variant="outline" className="h-8 bg-primary/10 text-primary">
                    Atual sempre visível
                  </Badge>
                  {([
                    ["average", "Média"],
                    ["minimum", "Mínimo"],
                    ["peak", "Máximo"],
                  ] as const).map(([key, label]) => (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={form.series[key] ? "default" : "outline"}
                      aria-pressed={form.series[key]}
                      onClick={() =>
                        onChange((current) => ({
                          ...current,
                          series: {
                            ...current.series,
                            [key]: !current.series[key],
                          },
                        }))
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSave} disabled={!form.title.trim()}>
            {form.id ? "Salvar alterações" : "Adicionar widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OccupancyCustomWidgetActions({
  onEdit,
  onRemove,
  title,
}: {
  onEdit: () => void;
  onRemove: () => void;
  title: string;
}) {
  return (
    <WidgetCardActions
      className="flex-wrap justify-start gap-2"
      label={`Ações do widget ${title}`}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-0"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        aria-label={`Editar widget ${title}`}
        title="Editar widget"
      >
        <Pencil className="h-4 w-4" />
        Editar conteúdo
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-0 text-muted-foreground hover:text-destructive"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remover widget ${title}`}
        title="Remover widget"
      >
        <Trash2 className="h-4 w-4" />
        Remover widget
      </Button>
    </WidgetCardActions>
  );
}
