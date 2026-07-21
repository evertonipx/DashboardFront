"use client";

import { CalendarRange } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  countingReportPeriodForPreset,
  countingReportPeriodMonthCount,
  detectCountingReportPeriodPreset,
  maximumCountingReportMonth,
  minimumCountingReportMonth,
  normalizeCountingReportPeriod,
  type CountingReportPeriod,
  type CountingReportPeriodPreset,
} from "@/lib/counting-report-period";
import { cn } from "@/lib/utils";

type CountingReportPeriodControlProps = {
  disabled?: boolean;
  includeOpenPeriod: boolean;
  onChange: (period: CountingReportPeriod) => void;
  onIncludeOpenPeriodChange: (value: boolean) => void;
  value: CountingReportPeriod;
};

export function CountingReportPeriodControl({
  disabled = false,
  includeOpenPeriod,
  onChange,
  onIncludeOpenPeriodChange,
  value,
}: CountingReportPeriodControlProps) {
  const now = new Date();
  const normalized = normalizeCountingReportPeriod(value, now);
  const preset = detectCountingReportPeriodPreset(normalized, now);
  const monthCount = countingReportPeriodMonthCount(normalized);
  const effectiveMonthCount =
    !includeOpenPeriod && normalized.to === maximumCountingReportMonth(now)
      ? Math.max(0, monthCount - 1)
      : monthCount;

  function updateBoundary(boundary: keyof CountingReportPeriod, month: string) {
    const next = { ...normalized, [boundary]: month };
    if (boundary === "from" && month > next.to) next.to = month;
    if (boundary === "to" && month < next.from) next.from = month;
    onChange(normalizeCountingReportPeriod(next, now));
  }

  function updatePreset(nextPreset: CountingReportPeriodPreset) {
    if (nextPreset === "custom") return;
    onChange(countingReportPeriodForPreset(nextPreset, now));
  }

  return (
    <div className="grid min-w-0 gap-3 rounded-md border bg-muted/15 p-3 2xl:grid-cols-[minmax(230px,0.8fr)_minmax(0,2fr)] 2xl:items-start">
      <div className="flex min-w-0 items-start gap-2 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
          <CalendarRange className="h-4 w-4" />
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="text-sm font-medium">Período do relatório</div>
          <div className="truncate text-[11px] text-muted-foreground">
            Todos os widgets, tabelas e exportações
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-[170px_minmax(145px,1fr)_minmax(145px,1fr)_190px_auto] 2xl:items-end">
        <div className="space-y-1">
          <label
            htmlFor="counting-report-period-preset"
            className="text-[10px] font-semibold uppercase text-muted-foreground"
          >
            Atalho
          </label>
          <Select
            disabled={disabled}
            value={preset}
            onValueChange={(next) =>
              updatePreset(next as CountingReportPeriodPreset)
            }
          >
            <SelectTrigger
              id="counting-report-period-preset"
              className="h-9 bg-card text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="history">Histórico completo</SelectItem>
              <SelectItem value="current_year">Ano atual</SelectItem>
              <SelectItem value="last_12_months">Últimos 12 meses</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="counting-report-period-from"
            className="text-[10px] font-semibold uppercase text-muted-foreground"
          >
            De
          </label>
          <Input
            id="counting-report-period-from"
            type="month"
            className="h-9 min-w-0 bg-card text-xs"
            disabled={disabled}
            min={minimumCountingReportMonth()}
            max={maximumCountingReportMonth(now)}
            value={normalized.from}
            onChange={(event) => updateBoundary("from", event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="counting-report-period-to"
            className="text-[10px] font-semibold uppercase text-muted-foreground"
          >
            Até
          </label>
          <Input
            id="counting-report-period-to"
            type="month"
            className="h-9 min-w-0 bg-card text-xs"
            disabled={disabled}
            min={minimumCountingReportMonth()}
            max={maximumCountingReportMonth(now)}
            value={normalized.to}
            onChange={(event) => updateBoundary("to", event.target.value)}
          />
        </div>

        <div className="flex h-9 min-w-0 items-center justify-between gap-3 rounded-md border bg-card px-3">
          <div className="min-w-0">
            <label
              htmlFor="counting-report-open-period"
              className="block truncate text-[10px] font-semibold uppercase text-muted-foreground"
            >
              Mês em andamento
            </label>
            <div className="truncate text-[10px] text-muted-foreground">
              {includeOpenPeriod ? "Incluir parcial" : "Somente fechados"}
            </div>
          </div>
          <button
            id="counting-report-open-period"
            type="button"
            role="switch"
            aria-checked={includeOpenPeriod}
            disabled={disabled}
            onClick={() => onIncludeOpenPeriodChange(!includeOpenPeriod)}
            className={cn(
              "h-5 w-9 shrink-0 rounded-full p-0.5 transition disabled:cursor-not-allowed disabled:opacity-50",
              includeOpenPeriod ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "block h-4 w-4 rounded-full bg-background transition",
                includeOpenPeriod && "translate-x-4",
              )}
            />
          </button>
        </div>

        <Badge
          variant="outline"
          className="h-9 justify-center whitespace-nowrap bg-card px-3 text-[10px]"
        >
          {effectiveMonthCount}{" "}
          {effectiveMonthCount === 1 ? "mês" : "meses"}
          {!includeOpenPeriod ? " fechados" : ""}
        </Badge>
      </div>
    </div>
  );
}
