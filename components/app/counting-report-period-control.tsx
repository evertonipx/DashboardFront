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
    <div className="@container min-w-0 rounded-md border bg-muted/15 p-3">
      <div className="grid min-w-0 gap-2 @4xl:grid-cols-[160px_minmax(0,1fr)] @4xl:items-end">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
            <CalendarRange className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">Período do relatório</div>
            <div className="hidden truncate text-[10px] text-muted-foreground @lg:block">
              Todos os widgets, tabelas e exportações
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 @lg:grid-cols-[144px_120px_minmax(0,120px)] @lg:items-end @2xl:grid-cols-[144px_120px_120px_150px_minmax(72px,1fr)]">
          <div className="col-span-2 min-w-0 space-y-1 @lg:col-span-1 @lg:col-start-1 @lg:row-start-1 @2xl:col-start-1 @2xl:row-start-1">
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
                className="h-8 w-full min-w-0 bg-card text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="history">Histórico completo</SelectItem>
                <SelectItem value="current_year">Ano atual</SelectItem>
                <SelectItem value="last_12_months">
                  Últimos 12 meses
                </SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-start-1 row-start-2 min-w-0 space-y-1 @lg:col-start-2 @lg:row-start-1 @2xl:col-start-2 @2xl:row-start-1">
            <label
              htmlFor="counting-report-period-from"
              className="text-[10px] font-semibold uppercase text-muted-foreground"
            >
              De
            </label>
            <Input
              id="counting-report-period-from"
              type="month"
              className="h-8 w-full min-w-0 max-w-full bg-card text-xs"
              disabled={disabled}
              min={minimumCountingReportMonth()}
              max={maximumCountingReportMonth(now)}
              value={normalized.from}
              onChange={(event) => updateBoundary("from", event.target.value)}
            />
          </div>

          <div className="col-start-2 row-start-2 min-w-0 space-y-1 @lg:col-start-3 @lg:row-start-1 @2xl:col-start-3 @2xl:row-start-1">
            <label
              htmlFor="counting-report-period-to"
              className="text-[10px] font-semibold uppercase text-muted-foreground"
            >
              Até
            </label>
            <Input
              id="counting-report-period-to"
              type="month"
              className="h-8 w-full min-w-0 max-w-full bg-card text-xs"
              disabled={disabled}
              min={minimumCountingReportMonth()}
              max={maximumCountingReportMonth(now)}
              value={normalized.to}
              onChange={(event) => updateBoundary("to", event.target.value)}
            />
          </div>

          <div className="col-start-1 row-start-3 flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border bg-card px-2.5 @lg:col-span-2 @lg:col-start-1 @lg:row-start-2 @2xl:col-span-1 @2xl:col-start-4 @2xl:row-start-1">
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
                "h-5 w-9 shrink-0 rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
            className="col-start-2 row-start-3 h-8 min-w-0 justify-center overflow-hidden bg-card px-2 text-[10px] @lg:col-start-3 @lg:row-start-2 @2xl:col-start-5 @2xl:row-start-1"
            title={`${effectiveMonthCount} ${
              effectiveMonthCount === 1 ? "mês" : "meses"
            }${!includeOpenPeriod ? " fechados" : ""}`}
          >
            <span className="truncate whitespace-nowrap">
              {effectiveMonthCount}{" "}
              {effectiveMonthCount === 1 ? "mês" : "meses"}
              {!includeOpenPeriod ? " fechados" : ""}
            </span>
          </Badge>
        </div>
      </div>
    </div>
  );
}
