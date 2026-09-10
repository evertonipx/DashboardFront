"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEMOGRAPHICS_PALETTES, demographicPalettePreviewColors, getDemographicPalette } from "@/lib/demographics-presentation";
import {
  defaultDemographicTemporalSettings,
  demographicTemporalCategories,
  isDemographicHourlyProfile,
  normalizeDemographicTemporalSettings,
  type DemographicTemporalSettings,
  type DemographicTemporalWidgetId,
} from "@/lib/demographics-temporal-preferences";

export function DemographicsTemporalControls({ widgetId, value, onChange, disabled = false }: {
  widgetId: DemographicTemporalWidgetId;
  value?: DemographicTemporalSettings;
  onChange: (value: DemographicTemporalSettings) => void;
  disabled?: boolean;
}) {
  const settings = normalizeDemographicTemporalSettings(value, widgetId);
  const categories = demographicTemporalCategories(settings.dimension);
  const selected = new Set(settings.categoryKeys.length ? settings.categoryKeys : categories.map(({ key }) => key));
  const palette = getDemographicPalette(settings.palette);
  const hourly = isDemographicHourlyProfile(widgetId);
  const comparison = widgetId === "demographics_period_comparison";
  const update = (patch: Partial<DemographicTemporalSettings>) => {
    if (!disabled) onChange(normalizeDemographicTemporalSettings({ ...settings, ...patch }, widgetId));
  };
  const selectCategory = (key: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(key); else next.delete(key);
    // One category must remain selected: [] explicitly means all, not none.
    if (next.size) update({ categoryKeys: [...next] });
  };
  return (
    <div className="grid min-w-0 gap-4" data-demographics-temporal-controls>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Control label="Dimensão">
          <Select disabled={disabled} value={settings.dimension} onValueChange={(dimension) => update({ dimension: dimension as DemographicTemporalSettings["dimension"], categoryKeys: [] })}>
            <SelectTrigger aria-label="Dimensão demográfica" className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="gender">Gênero</SelectItem><SelectItem value="age">Faixa etária</SelectItem><SelectItem value="emotion">Emoção</SelectItem></SelectContent>
          </Select>
        </Control>
        <Control label="Métrica">
          <Select disabled={disabled} value={settings.metric} onValueChange={(metric) => update({ metric: metric as DemographicTemporalSettings["metric"] })}>
            <SelectTrigger aria-label="Métrica do gráfico temporal" className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="percentage">Participação (%)</SelectItem><SelectItem value="count">Detecções</SelectItem></SelectContent>
          </Select>
        </Control>
        <Control label="Visualização">
          <Select disabled={disabled} value={settings.chartType} onValueChange={(chartType) => update({ chartType: chartType as DemographicTemporalSettings["chartType"] })}>
            <SelectTrigger aria-label="Visualização do gráfico temporal" className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="bar">Barras</SelectItem><SelectItem value="area">Área</SelectItem><SelectItem value="line">Linhas</SelectItem><SelectItem value="heatmap">Mapa de calor</SelectItem></SelectContent>
          </Select>
        </Control>
        {!hourly && !comparison ? <Control label="Agrupamento">
          <Select disabled={disabled} value={settings.granularity} onValueChange={(granularity) => update({ granularity: granularity as DemographicTemporalSettings["granularity"] })}>
            <SelectTrigger aria-label="Agrupamento temporal" className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="auto">Automático</SelectItem><SelectItem value="hour">Por hora</SelectItem><SelectItem value="day">Por dia</SelectItem><SelectItem value="month">Por mês</SelectItem></SelectContent>
          </Select>
        </Control> : null}
      </div>
      {hourly ? <p className="text-xs leading-5 text-muted-foreground">Perfil das 24 horas: reúne as mesmas horas dos dias selecionados, no fuso da empresa.</p> : null}
      {comparison ? <Control label="Comparar com">
        <Select disabled={disabled} value={settings.comparison} onValueChange={(next) => update({ comparison: next as DemographicTemporalSettings["comparison"] })}>
          <SelectTrigger aria-label="Período de comparação" className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="previous-period">Período anterior equivalente</SelectItem><SelectItem value="previous-week">Semana anterior</SelectItem><SelectItem value="previous-month">Mês anterior</SelectItem></SelectContent>
        </Select>
      </Control> : null}
      <fieldset disabled={disabled} className="min-w-0 space-y-2">
        <legend className="text-xs font-medium">Categorias visíveis</legend>
        <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5">
          {categories.map(({ key, label }) => <label key={key} className="flex min-w-0 cursor-pointer items-start gap-2 text-xs leading-5">
            <Checkbox checked={selected.has(key)} disabled={disabled || (selected.has(key) && selected.size === 1)} className="mt-0.5 shrink-0"
              onCheckedChange={(checked) => selectCategory(key, checked === true)} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
          </label>)}
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || selected.size === categories.length} className="h-8 px-0 text-xs" onClick={() => update({ categoryKeys: [] })}>Mostrar todas as categorias</Button>
        <p className="text-xs leading-5 text-muted-foreground">Os percentuais usam o total de todas as categorias de cada intervalo, mesmo quando algumas estão ocultas. Mantenha pelo menos uma categoria visível.</p>
      </fieldset>
      {comparison && settings.dimension === "gender" ? (
        <p className="text-xs leading-5 text-muted-foreground">As cores distinguem os períodos comparados, não os gêneros.</p>
      ) : <Control label="Paleta de cores">
        <Select disabled={disabled} value={palette.id} onValueChange={(next) => update({ palette: getDemographicPalette(next).id })}>
          <SelectTrigger aria-label={`Paleta temporal: ${palette.label}`} className="h-9 w-full min-w-0 text-xs"><SelectValue>{palette.label}</SelectValue></SelectTrigger>
          <SelectContent className="max-h-72">
            {DEMOGRAPHICS_PALETTES.map((option) => <SelectItem key={option.id} value={option.id} textValue={option.label}>
              <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="inline-flex shrink-0 overflow-hidden rounded-sm">{demographicPalettePreviewColors(option.id, settings.dimension).slice(0, 5).map((color, index) => <span key={`${color}-${index}`} className="h-3 w-2" style={{ backgroundColor: color }} />)}</span><span className="min-w-0 [overflow-wrap:anywhere]">{option.label}</span></span>
            </SelectItem>)}
          </SelectContent>
        </Select>
      </Control>}
      <Button type="button" variant="ghost" size="sm" disabled={disabled} className="h-8 justify-self-start px-0 text-xs text-muted-foreground" onClick={() => { if (!disabled) onChange(defaultDemographicTemporalSettings(widgetId)); }}>
        <RotateCcw className="h-3.5 w-3.5" />Restaurar configuração padrão
      </Button>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-2"><span className="text-xs font-medium">{label}</span>{children}</div>;
}
