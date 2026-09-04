"use client";

import * as React from "react";
import { CalendarRange, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COUNTING_REPORT_HISTORY_YEARS,
  countingReportPeriodForPreset,
  countingReportPeriodMonthCount,
  detectCountingReportPeriodPreset,
  formatCountingReportPeriod,
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
  onApply?: (
    period: CountingReportPeriod,
    includeOpenPeriod: boolean,
  ) => void;
  onChange: (period: CountingReportPeriod) => void;
  onIncludeOpenPeriodChange: (value: boolean) => void;
  pending?: boolean;
  value: CountingReportPeriod;
};

const PERIOD_PRESETS: Array<{
  description: string;
  label: string;
  value: Exclude<CountingReportPeriodPreset, "custom">;
}> = [
  {
    description: "Visão histórica recomendada",
    label: `Últimos ${COUNTING_REPORT_HISTORY_YEARS} anos`,
    value: "history",
  },
  {
    description: "De janeiro até o mês atual",
    label: "Ano atual",
    value: "current_year",
  },
  {
    description: "Janela móvel mensal",
    label: "Últimos 12 meses",
    value: "last_12_months",
  },
];

export function CountingReportPeriodControl({
  disabled = false,
  includeOpenPeriod,
  onApply,
  onChange,
  onIncludeOpenPeriodChange,
  pending = false,
  value,
}: CountingReportPeriodControlProps) {
  const fromInputId = React.useId();
  const toInputId = React.useId();
  const openPeriodId = React.useId();
  const now = React.useMemo(() => new Date(), []);
  const normalized = normalizeCountingReportPeriod(value, now);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(normalized);
  const [draftIncludeOpenPeriod, setDraftIncludeOpenPeriod] =
    React.useState(includeOpenPeriod);
  const draftPreset = detectCountingReportPeriodPreset(draft, now);
  const draftMonthCount = countingReportPeriodMonthCount(draft);
  const effectiveDraftMonthCount =
    !draftIncludeOpenPeriod && draft.to === maximumCountingReportMonth(now)
      ? Math.max(0, draftMonthCount - 1)
      : draftMonthCount;
  const draftChanged =
    draft.from !== normalized.from ||
    draft.to !== normalized.to ||
    draftIncludeOpenPeriod !== includeOpenPeriod;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setDraft(normalized);
    setDraftIncludeOpenPeriod(includeOpenPeriod);
  }

  function updateBoundary(boundary: keyof CountingReportPeriod, month: string) {
    if (!month) return;
    const next = { ...draft, [boundary]: month };
    if (boundary === "from" && month > next.to) next.to = month;
    if (boundary === "to" && month < next.from) next.from = month;
    setDraft(normalizeCountingReportPeriod(next, now));
  }

  function updatePreset(
    nextPreset: Exclude<CountingReportPeriodPreset, "custom">,
  ) {
    setDraft(countingReportPeriodForPreset(nextPreset, now));
  }

  function applyDraft() {
    const nextPeriod = normalizeCountingReportPeriod(draft, now);
    onChange(nextPeriod);
    if (draftIncludeOpenPeriod !== includeOpenPeriod) {
      onIncludeOpenPeriodChange(draftIncludeOpenPeriod);
    }
    onApply?.(nextPeriod, draftIncludeOpenPeriod);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 w-8 min-w-0 max-w-full shrink-0 justify-center bg-card px-0 py-0 text-left text-xs @sm:w-full @sm:justify-start @sm:px-2.5"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={`Alterar período do relatório. Atual: ${formatCountingReportPeriod(normalized)}`}
          title={`${formatCountingReportPeriod(normalized)} · ${countingReportPeriodMonthCount(normalized)} meses`}
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
          <span className="sr-only font-medium @sm:not-sr-only @sm:min-w-0 @sm:flex-1 @sm:truncate">
            {formatCountingReportPeriod(normalized)}
          </span>
          <span className="hidden shrink-0 text-[10px] font-normal text-muted-foreground @2xl:inline">
            {countingReportPeriodMonthCount(normalized)} meses
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="grid max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Período do relatório</DialogTitle>
          <DialogDescription>
            Defina uma visão histórica ou personalize os meses. O relatório só
            será atualizado ao aplicar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 min-w-0 overflow-y-auto md:grid-cols-[190px_minmax(0,1fr)]">
          <div className="border-b bg-muted/20 p-3 md:border-b-0 md:border-r">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Atalhos
            </div>
            <div className="grid gap-1.5">
              {PERIOD_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant={draftPreset === preset.value ? "secondary" : "ghost"}
                  className="h-auto min-h-10 justify-start gap-2 px-2.5 py-2 text-left"
                  onClick={() => updatePreset(preset.value)}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {draftPreset === preset.value ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {preset.label}
                    </span>
                    <span className="block truncate text-[10px] font-normal text-muted-foreground">
                      {preset.description}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <div className="min-w-0 space-y-4 p-4 md:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={fromInputId}>Mês inicial</Label>
                <Input
                  id={fromInputId}
                  type="month"
                  className="h-9 bg-card"
                  min={minimumCountingReportMonth(now)}
                  max={maximumCountingReportMonth(now)}
                  value={draft.from}
                  onChange={(event) =>
                    updateBoundary("from", event.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={toInputId}>Mês final</Label>
                <Input
                  id={toInputId}
                  type="month"
                  className="h-9 bg-card"
                  min={minimumCountingReportMonth(now)}
                  max={maximumCountingReportMonth(now)}
                  value={draft.to}
                  onChange={(event) => updateBoundary("to", event.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              role="switch"
              id={openPeriodId}
              aria-checked={draftIncludeOpenPeriod}
              onClick={() =>
                setDraftIncludeOpenPeriod((current) => !current)
              }
              className="flex w-full items-center justify-between gap-4 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Incluir mês em andamento
                </span>
                <span className="block text-xs text-muted-foreground">
                  {draftIncludeOpenPeriod
                    ? "Inclui os dados parciais do mês atual."
                    : "Considera somente meses encerrados."}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "h-5 w-9 shrink-0 rounded-full p-0.5 transition",
                  draftIncludeOpenPeriod
                    ? "bg-primary"
                    : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "block h-4 w-4 rounded-full bg-background transition-transform",
                    draftIncludeOpenPeriod && "translate-x-4",
                  )}
                />
              </span>
            </button>

            <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-muted/15 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">
                  {formatCountingReportPeriod(draft)}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  Aplicado a widgets, tabelas e exportações
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 bg-card">
                {effectiveDraftMonthCount}{" "}
                {effectiveDraftMonthCount === 1 ? "mês" : "meses"}
                {!draftIncludeOpenPeriod ? " fechados" : ""}
              </Badge>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/10 px-5 py-3">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          {onApply ? (
            <Button
              type="button"
              disabled={!pending && !draftChanged}
              onClick={applyDraft}
            >
              Aplicar período
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
