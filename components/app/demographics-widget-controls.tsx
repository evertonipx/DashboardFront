"use client";

import { BarChart3, ChartNoAxesColumnIncreasing, ChartPie, Donut, RotateCcw, Smile } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { demographicHeatmapColors } from "@/lib/demographics-crossing-options";
import {
  DEMOGRAPHICS_PALETTES,
  defaultDemographicPresentation,
  demographicPaletteLabel,
  demographicPalettePreviewColors,
  getDemographicGenderPalette,
  getDemographicPalette,
  normalizeDemographicPresentation,
  type DemographicDimension,
  type DemographicPaletteId,
  type DemographicPresentation,
} from "@/lib/demographics-presentation";
import { cn } from "@/lib/utils";

const FORMATS = [
  { value: "bar", label: "Barras", icon: BarChart3 },
  { value: "stacked", label: "Barra 100%", icon: ChartNoAxesColumnIncreasing },
  { value: "pie", label: "Pizza", icon: ChartPie },
  { value: "donut", label: "Rosca", icon: Donut },
  { value: "half-donut", label: "Meia rosca", icon: HalfDonutIcon },
  { value: "rose", label: "Rosa polar", icon: ChartPie },
] as const;

export function DemographicsWidgetControls({ dimension, value, onChange, theme = "light" }: {
  dimension: DemographicDimension;
  value?: DemographicPresentation;
  onChange: (value: DemographicPresentation) => void;
  theme?: "light" | "dark";
}) {
  const settings = normalizeDemographicPresentation(value, dimension);
  const palette = getDemographicPalette(settings.palette);
  const distribution = dimension === "gender" || dimension === "age" || dimension === "emotion";
  const heatmap = dimension === "age-emotion";
  const genderColors = dimension === "gender" || dimension === "age-gender"
    ? getDemographicGenderPalette(palette.id) : null;
  const paletteColors = (id: DemographicPaletteId) => heatmap
    ? demographicHeatmapColors(id, theme) : demographicPalettePreviewColors(id, dimension);
  const paletteLabel = (id: DemographicPaletteId) =>
    demographicPaletteLabel(id, dimension, heatmap ? "intensity" : "category");
  const update = (patch: Partial<DemographicPresentation>) =>
    onChange(normalizeDemographicPresentation({ ...settings, ...patch }, dimension));
  return (
    <div className="grid min-w-0 gap-4" data-demographics-controls>
      {distribution ? (
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-xs font-medium">Visualização</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {FORMATS.map(({ value: type, label, icon: Icon }) => (
              <Button key={type} type="button" variant="outline" aria-pressed={settings.type === type}
                className={cn("h-auto min-h-9 min-w-0 justify-start gap-2 whitespace-normal px-2 py-2 text-xs", settings.type === type && "border-primary bg-primary/10 text-primary")}
                onClick={() => update({ type })}>
                <Icon className="h-4 w-4 shrink-0" /><span>{label}</span>
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {distribution && (settings.type === "bar" || settings.type === "stacked") ? (
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-xs font-medium">Orientação</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {([ ["horizontal", "Horizontal"], ["vertical", "Vertical"] ] as const).map(([orientation, label]) => (
              <Button key={orientation} type="button" variant="outline" size="sm" aria-pressed={settings.orientation === orientation}
                className={cn("min-w-0 text-xs", settings.orientation === orientation && "border-primary bg-primary/10 text-primary")}
                onClick={() => update({ orientation })}>{label}</Button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid min-w-0 gap-2">
        <span className="text-xs font-medium">{distribution ? "Ordem das categorias" : "Ordem das faixas etárias"}</span>
        <Select value={settings.order} onValueChange={(order) => update({ order: order as DemographicPresentation["order"] })}>
          <SelectTrigger aria-label="Ordenação por participação" className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Ordem natural</SelectItem>
            <SelectItem value="descending">Maior para menor participação</SelectItem>
            <SelectItem value="ascending">Menor para maior participação</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-2">
        <span className="text-xs font-medium">Paleta de cores</span>
        <Select value={palette.id} onValueChange={(next) => update({ palette: getDemographicPalette(next).id })}>
          <SelectTrigger aria-label={`Paleta de cores: ${paletteLabel(palette.id)}`} className="h-9 w-full min-w-0 text-xs">
            <span className="flex min-w-0 items-center gap-2"><PaletteSwatches colors={paletteColors(palette.id)} complete={dimension === "age" || heatmap} /><span className="truncate">{paletteLabel(palette.id)}</span></span>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {DEMOGRAPHICS_PALETTES.map((option) => (
              <SelectItem key={option.id} value={option.id} textValue={paletteLabel(option.id)}>
                <span className="flex min-w-0 items-center gap-2"><PaletteSwatches colors={paletteColors(option.id)} complete={dimension === "age" || heatmap} /><span>{paletteLabel(option.id)}</span></span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {dimension === "age" ? <p className="text-xs leading-5 text-muted-foreground">Mais jovens → mais velhos · claro → escuro</p> : null}
        {heatmap ? <p className="text-xs leading-5 text-muted-foreground">As cores representam a intensidade dos valores, não as categorias.</p> : null}
        {genderColors ? <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Cores por gênero">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: genderColors.Woman }} />Mulher</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: genderColors.Man }} />Homem</span>
        </div> : null}
      </div>
      <label className="flex min-w-0 cursor-pointer items-start gap-2 text-xs leading-5">
        <Checkbox className="mt-0.5 shrink-0" checked={settings.emojis} onCheckedChange={(checked) => update({ emojis: checked === true })} />
        <Smile className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>Mostrar emojis à direita dos nomes</span>
      </label>
      <Button type="button" variant="ghost" size="sm" className="h-8 justify-self-start px-0 text-xs text-muted-foreground"
        onClick={() => onChange(defaultDemographicPresentation(dimension))}>
        <RotateCcw className="h-3.5 w-3.5" />Restaurar visualização padrão
      </Button>
    </div>
  );
}

function PaletteSwatches({ colors, complete = false }: { colors: readonly string[]; complete?: boolean }) {
  return <span aria-hidden="true" className="inline-flex shrink-0 overflow-hidden rounded-sm ring-1 ring-border/60">
    {(complete ? colors : colors.slice(0, 5)).map((color, index) => <span key={`${color}-${index}`} className="h-3 w-2" style={{ backgroundColor: color }} />)}
  </span>;
}

function HalfDonutIcon({ className }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M2 19a10 10 0 0 1 20 0h-5a5 5 0 0 0-10 0H2Z" /><path d="m6 11 3.5 3.5M12 9v5M18 11l-3.5 3.5" />
  </svg>;
}
