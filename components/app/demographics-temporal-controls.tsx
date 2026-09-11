"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { demographicComparisonColors } from "@/lib/demographics-comparison-colors";
import { demographicHeatmapColors } from "@/lib/demographics-crossing-options";
import { DEMOGRAPHICS_PALETTES, demographicPaletteLabel, demographicPalettePreviewColors, getDemographicGenderPalette, getDemographicPalette, type DemographicPaletteId } from "@/lib/demographics-presentation";
import {
  defaultDemographicTemporalSettings,
  demographicTemporalCategories,
  isDemographicHourlyProfile,
  normalizeDemographicTemporalSettings,
  type DemographicTemporalSettings,
  type DemographicTemporalWidgetId,
} from "@/lib/demographics-temporal-preferences";

export function DemographicsTemporalControls({ widgetId, value, onChange, disabled = false, theme = "light" }: {
  widgetId: DemographicTemporalWidgetId;
  value?: DemographicTemporalSettings;
  onChange: (value: DemographicTemporalSettings) => void;
  disabled?: boolean;
  theme?: "light" | "dark";
}) {
  const settings = normalizeDemographicTemporalSettings(value, widgetId);
  const categories = demographicTemporalCategories(settings.dimension);
  const selected = new Set(settings.categoryKeys.length ? settings.categoryKeys : categories.map(({ key }) => key));
  const palette = getDemographicPalette(settings.palette);
  const hourly = isDemographicHourlyProfile(widgetId);
  const comparison = widgetId === "demographics_period_comparison";
  const heatmap = settings.chartType === "heatmap";
  const categoricalAge = settings.dimension === "age" && !comparison && !heatmap;
  const genderColors = settings.dimension === "gender" && !comparison && !heatmap
    ? getDemographicGenderPalette(palette.id) : null;
  const paletteColors = (id: DemographicPaletteId) => heatmap
    ? demographicHeatmapColors(id, theme)
    : comparison ? demographicComparisonColors(id, settings.dimension, theme)
      : demographicPalettePreviewColors(id, settings.dimension);
  const paletteLabel = (id: DemographicPaletteId) =>
    demographicPaletteLabel(id, settings.dimension, heatmap ? "intensity" : comparison ? "period" : "category");
  const swatches = (id: DemographicPaletteId) => {
    const colors = paletteColors(id);
    return <span aria-hidden="true" className="inline-flex shrink-0 overflow-hidden rounded-sm">{(categoricalAge || heatmap ? colors : colors.slice(0, 5)).map((color, index) => <span key={`${color}-${index}`} className="h-3 w-2" style={{ backgroundColor: color }} />)}</span>;
  };
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
        <p className="text-xs leading-5 text-muted-foreground">{settings.dimension === "gender"
          ? "Os percentuais consideram Mulher e Homem em cada intervalo, mesmo quando uma dessas categorias está oculta."
          : "Os percentuais usam o total de todas as categorias de cada intervalo, mesmo quando algumas estão ocultas."} Mantenha pelo menos uma categoria visível.</p>
      </fieldset>
      {comparison && !heatmap && settings.dimension === "gender" ? (
        <div className="grid min-w-0 gap-2">
          <p className="text-xs leading-5 text-muted-foreground">As cores distinguem os períodos comparados, não os gêneros.</p>
          {demographicComparisonColors(settings.palette, settings.dimension, theme).map((color, index) => (
            <span key={index} className="flex min-w-0 items-center gap-2 text-xs"><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} />{index === 0 ? "Período analisado" : "Período de comparação"}</span>
          ))}
        </div>
      ) : <Control label="Paleta de cores">
        <Select disabled={disabled} value={palette.id} onValueChange={(next) => update({ palette: getDemographicPalette(next).id })}>
          <SelectTrigger aria-label={`Paleta temporal: ${paletteLabel(palette.id)}`} className="h-9 w-full min-w-0 text-xs"><span className="flex min-w-0 items-center gap-2">{swatches(palette.id)}<span className="truncate">{paletteLabel(palette.id)}</span></span></SelectTrigger>
          <SelectContent className="max-h-72">
            {DEMOGRAPHICS_PALETTES.map((option) => <SelectItem key={option.id} value={option.id} textValue={paletteLabel(option.id)}>
              <span className="flex min-w-0 items-center gap-2">{swatches(option.id)}<span className="min-w-0 [overflow-wrap:anywhere]">{paletteLabel(option.id)}</span></span>
            </SelectItem>)}
          </SelectContent>
        </Select>
      </Control>}
      {categoricalAge ? <p className="text-xs leading-5 text-muted-foreground">Mais jovens → mais velhos · claro → escuro</p> : null}
      {genderColors ? <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Cores por gênero">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: genderColors.Woman }} />Mulher</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: genderColors.Man }} />Homem</span>
      </div> : null}
      {heatmap ? <p className="text-xs leading-5 text-muted-foreground">As cores representam a intensidade dos valores, não as categorias.</p> : null}
      {comparison && !heatmap && settings.dimension !== "gender" ? <p className="text-xs leading-5 text-muted-foreground">As cores distinguem os períodos comparados; as categorias aparecem no eixo.</p> : null}
      <Button type="button" variant="ghost" size="sm" disabled={disabled} className="h-8 justify-self-start px-0 text-xs text-muted-foreground" onClick={() => { if (!disabled) onChange(defaultDemographicTemporalSettings(widgetId)); }}>
        <RotateCcw className="h-3.5 w-3.5" />Restaurar configuração padrão
      </Button>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-2"><span className="text-xs font-medium">{label}</span>{children}</div>;
}
