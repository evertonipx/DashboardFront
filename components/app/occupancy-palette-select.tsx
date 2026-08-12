"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  getOccupancyColorPalette,
  OCCUPANCY_COLOR_PALETTES,
  type OccupancyColorPaletteId,
} from "@/lib/occupancy-color-palettes";

export function OccupancyPaletteSelect({
  ariaLabel = "Paleta dos comparativos desta visão",
  onValueChange,
  value,
}: {
  ariaLabel?: string;
  onValueChange: (value: OccupancyColorPaletteId) => void;
  value: OccupancyColorPaletteId;
}) {
  const palette = getOccupancyColorPalette(value);

  return (
    <Select
      value={palette.id}
      onValueChange={(nextValue) =>
        onValueChange(nextValue as OccupancyColorPaletteId)
      }
    >
      <SelectTrigger
        aria-label={`${ariaLabel}: ${palette.label}`}
        className="h-8 w-[116px] shrink-0 bg-card px-2"
        title={`${palette.label} — ${palette.description}`}
      >
        <PaletteSwatches colors={palette.colors} selected />
      </SelectTrigger>
      <SelectContent className="max-h-[360px] sm:min-w-[340px]">
        {OCCUPANCY_COLOR_PALETTES.map((option) => (
          <SelectItem
            key={option.id}
            value={option.id}
            textValue={option.label}
            aria-label={option.label}
            title={`${option.label} — ${option.description}`}
          >
            <span className="flex min-w-0 items-center gap-2.5 py-0.5">
              <PaletteSwatches colors={option.colors} />
              <span className="min-w-0">
                <span className="block font-medium">{option.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PaletteSwatches({
  colors,
  selected = false,
}: {
  colors: readonly string[];
  selected?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 overflow-hidden rounded-sm bg-background ring-1 ring-border/80 shadow-sm"
      style={{ display: "inline-flex" }}
    >
      {colors.slice(0, selected ? 10 : 5).map((color, index) => (
        <span
          key={`${color}-${index}`}
          className={selected ? "block h-3.5 w-1.5 shrink-0" : "block h-3 w-2.5 shrink-0"}
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}
