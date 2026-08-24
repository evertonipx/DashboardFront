"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
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
  MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS,
  countOccupancyAnalysisDateRangeDays,
  formatOccupancyAnalysisDateInput,
  parseOccupancyAnalysisDateInput,
  shiftOccupancyAnalysisDateInput,
  type OccupancyAnalysisDateRangeInput,
} from "@/lib/occupancy-analysis-window";
import { cn } from "@/lib/utils";

type OccupancyDateRangePickerProps = {
  disabled?: boolean;
  maximumInput: string;
  onApply: (range: OccupancyAnalysisDateRangeInput) => void;
  timeZoneLabel: string;
  value: OccupancyAnalysisDateRangeInput;
};

export type AnalysisDateRangePickerProps =
  OccupancyDateRangePickerProps & {
    contextLabel: string;
    maximumDays?: number;
  };

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function OccupancyDateRangePicker({
  ...props
}: OccupancyDateRangePickerProps) {
  return (
    <AnalysisDateRangePicker
      {...props}
      contextLabel="análise de ocupação"
      maximumDays={MAX_OCCUPANCY_ANALYSIS_RANGE_DAYS}
    />
  );
}

export function AnalysisDateRangePicker({
  contextLabel,
  disabled,
  maximumDays,
  maximumInput,
  onApply,
  timeZoneLabel,
  value,
}: AnalysisDateRangePickerProps) {
  const startInputId = React.useId();
  const endInputId = React.useId();
  const calendarRootRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [error, setError] = React.useState("");
  const [selectingEnd, setSelectingEnd] = React.useState(false);
  const [hoveredInput, setHoveredInput] = React.useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = React.useState(() =>
    startOfMonth(parseOccupancyAnalysisDateInput(value.endInput) ?? new Date()),
  );
  const [focusedInput, setFocusedInput] = React.useState(value.endInput);
  const maximumDate = React.useMemo(
    () => parseOccupancyAnalysisDateInput(maximumInput) ?? new Date(),
    [maximumInput],
  );
  const previousVisibleMonth = addMonths(visibleMonth, -1);
  const canShowNextMonth =
    formatOccupancyAnalysisDateInput(addMonths(visibleMonth, 1)) <=
    maximumInput;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) return;
      setDraft(value);
      setError("");
      setSelectingEnd(false);
      setHoveredInput(null);
      setFocusedInput(value.endInput);
      setVisibleMonth(
        startOfMonth(
          parseOccupancyAnalysisDateInput(value.endInput) ?? maximumDate,
        ),
      );
    }, [maximumDate, value],
  );

  const validation = validateDraftRange(draft, maximumInput, maximumDays);

  function updateDraftField(
    field: keyof OccupancyAnalysisDateRangeInput,
    rawValue: string,
  ) {
    const nextValue = rawValue > maximumInput ? maximumInput : rawValue;
    setError("");
    setDraft((current) => ({ ...current, [field]: nextValue }));
    const parsed = parseOccupancyAnalysisDateInput(nextValue);
    if (parsed) {
      setVisibleMonth(startOfMonth(parsed));
      setFocusedInput(nextValue);
    }
  }

  function selectDate(dateInput: string) {
    if (dateInput > maximumInput) return;
    setError("");
    setFocusedInput(dateInput);
    setHoveredInput(null);
    if (!selectingEnd) {
      setDraft({ endInput: dateInput, startInput: dateInput });
      setSelectingEnd(true);
      return;
    }

    setDraft((current) =>
      dateInput < current.startInput
        ? { endInput: current.startInput, startInput: dateInput }
        : { ...current, endInput: dateInput },
    );
    setSelectingEnd(false);
  }

  function applyPreset(range: OccupancyAnalysisDateRangeInput) {
    setDraft(range);
    setError("");
    setSelectingEnd(false);
    setHoveredInput(null);
    setFocusedInput(range.endInput);
    const end = parseOccupancyAnalysisDateInput(range.endInput);
    if (end) setVisibleMonth(startOfMonth(end));
  }

  function applyDraft() {
    const nextValidation = validateDraftRange(
      draft,
      maximumInput,
      maximumDays,
    );
    if (nextValidation) {
      setError(nextValidation);
      return;
    }
    onApply(draft);
    setOpen(false);
  }

  function moveVisibleMonth(amount: number) {
    const next = addMonths(visibleMonth, amount);
    if (amount > 0 && formatOccupancyAnalysisDateInput(next) > maximumInput) {
      return;
    }
    const focusDate =
      amount > 0 && sameMonth(next, maximumDate)
        ? maximumDate
        : startOfMonth(next);
    const focusInput = formatOccupancyAnalysisDateInput(focusDate);
    setVisibleMonth(next);
    setFocusedInput(focusInput);
    focusCalendarDate(calendarRootRef.current, focusInput);
  }

  function handleDayKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    dateInput: string,
  ) {
    let nextInput: string | null = null;
    if (event.key === "ArrowLeft") {
      nextInput = shiftOccupancyAnalysisDateInput(dateInput, -1);
    } else if (event.key === "ArrowRight") {
      nextInput = shiftOccupancyAnalysisDateInput(dateInput, 1);
    } else if (event.key === "ArrowUp") {
      nextInput = shiftOccupancyAnalysisDateInput(dateInput, -7);
    } else if (event.key === "ArrowDown") {
      nextInput = shiftOccupancyAnalysisDateInput(dateInput, 7);
    } else if (event.key === "Home" || event.key === "End") {
      const parsed = parseOccupancyAnalysisDateInput(dateInput);
      if (parsed) {
        const weekdayIndex = (parsed.getDay() + 6) % 7;
        nextInput = shiftOccupancyAnalysisDateInput(
          dateInput,
          event.key === "Home" ? -weekdayIndex : 6 - weekdayIndex,
        );
      }
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      nextInput = shiftMonthClamped(
        dateInput,
        event.key === "PageUp" ? -1 : 1,
      );
    }
    if (!nextInput || nextInput > maximumInput) return;

    event.preventDefault();
    const nextDate = parseOccupancyAnalysisDateInput(nextInput);
    if (!nextDate) return;
    setFocusedInput(nextInput);
    const desktopCalendar = window.matchMedia("(min-width: 768px)").matches;
    const nextMonth = startOfMonth(nextDate);
    if (
      desktopCalendar
        ? nextDate < previousVisibleMonth ||
          nextDate >= addMonths(visibleMonth, 1)
        : !sameMonth(nextDate, visibleMonth)
    ) {
      setVisibleMonth(nextMonth);
    }
    focusCalendarDate(calendarRootRef.current, nextInput);
  }

  const presets = buildRangePresets(maximumDate);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 w-8 min-w-0 max-w-full shrink-0 justify-center bg-card px-0 py-0 text-left text-xs @sm:w-[300px] @sm:justify-start @sm:px-2.5"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={`Alterar período da ${contextLabel}. Atual: ${formatAnalysisDateRangeLabel(value)} no fuso ${timeZoneLabel}`}
          title={`${formatAnalysisDateRangeLabel(value)} · ${formatRangeDayCount(value)} · ${timeZoneLabel}`}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <span className="sr-only font-medium @sm:not-sr-only @sm:min-w-0 @sm:flex-1 @sm:truncate">
            {formatAnalysisDateRangeLabel(value)}
          </span>
          <span className="hidden shrink-0 text-[10px] font-normal text-muted-foreground @2xl:inline">
            {formatRangeDayCount(value)}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="grid max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Período da {contextLabel}</DialogTitle>
          <DialogDescription>
            Escolha datas civis inclusivas. A consulta só será atualizada ao
            aplicar, usa o fuso {timeZoneLabel} e nunca incluirá datas futuras.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 min-w-0 overflow-y-auto md:grid-cols-[170px_minmax(0,1fr)]">
          <div className="border-b bg-muted/20 p-3 md:border-b-0 md:border-r">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Atalhos
            </div>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => applyPreset(preset.range)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div ref={calendarRootRef} className="min-w-0 p-4 md:p-5">
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={startInputId}>Início</Label>
                <Input
                  id={startInputId}
                  type="date"
                  max={maximumInput}
                  value={draft.startInput}
                  onChange={(event) =>
                    updateDraftField("startInput", event.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={endInputId}>Fim</Label>
                <Input
                  id={endInputId}
                  type="date"
                  max={maximumInput}
                  value={draft.endInput}
                  onChange={(event) =>
                    updateDraftField("endInput", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Mostrar mês anterior"
                onClick={() => moveVisibleMonth(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {selectingEnd
                  ? "Agora selecione a data final."
                  : "Selecione a data inicial para começar um novo intervalo."}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Mostrar próximo mês"
                disabled={!canShowNextMonth}
                onClick={() => moveVisibleMonth(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="hidden md:block">
                <CalendarMonth
                  draft={draft}
                  focusedInput={focusedInput}
                  previewEndInput={selectingEnd ? hoveredInput : null}
                  maximumInput={maximumInput}
                  month={previousVisibleMonth}
                  onDayKeyDown={handleDayKeyDown}
                  onDayPreview={setHoveredInput}
                  onSelect={selectDate}
                />
              </div>
              <CalendarMonth
                draft={draft}
                focusedInput={focusedInput}
                previewEndInput={selectingEnd ? hoveredInput : null}
                maximumInput={maximumInput}
                month={visibleMonth}
                onDayKeyDown={handleDayKeyDown}
                onDayPreview={setHoveredInput}
                onSelect={selectDate}
              />
            </div>

            <div className="mt-4 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {formatAnalysisDateRangeLabel(draft)}
              </span>
              {validation ? null : ` · ${formatRangeDayCount(draft)}`}
              {maximumDays ? (
                <span className="block">
                  Máximo de {maximumDays} dias por consulta.
                </span>
              ) : null}
            </div>
            {error || validation ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error || validation}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={Boolean(validation)} onClick={applyDraft}>
            Aplicar período
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarMonth({
  draft,
  focusedInput,
  previewEndInput,
  maximumInput,
  month,
  onDayKeyDown,
  onDayPreview,
  onSelect,
}: {
  draft: OccupancyAnalysisDateRangeInput;
  focusedInput: string;
  previewEndInput: string | null;
  maximumInput: string;
  month: Date;
  onDayKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    dateInput: string,
  ) => void;
  onDayPreview: (dateInput: string | null) => void;
  onSelect: (dateInput: string) => void;
}) {
  const days = calendarMonthSlots(month);
  const monthLabelId = React.useId();
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(month);

  return (
    <div>
      <div
        id={monthLabelId}
        className="mb-3 text-center text-sm font-semibold capitalize"
      >
        {monthLabel}
      </div>
      <div
        role="grid"
        aria-labelledby={monthLabelId}
        aria-colcount={7}
        aria-rowcount={7}
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((weekday) => (
            <div
              key={weekday}
              role="columnheader"
              className="py-1 text-center text-[11px] font-medium text-muted-foreground"
            >
              {weekday}
            </div>
          ))}
        </div>
        <div role="rowgroup" className="grid gap-y-1">
          {Array.from({ length: 6 }, (_, weekIndex) => (
            <div
              key={`week-${weekIndex}`}
              role="row"
              className="grid grid-cols-7"
            >
              {days
                .slice(weekIndex * 7, weekIndex * 7 + 7)
                .map((date, dayIndex) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${weekIndex}-${dayIndex}`}
                        role="gridcell"
                        aria-disabled="true"
                      />
                    );
                  }
                  const dateInput = formatOccupancyAnalysisDateInput(date);
                  const disabled = dateInput > maximumInput;
                  const selected =
                    dateInput >= draft.startInput &&
                    dateInput <= draft.endInput;
                  const boundary =
                    dateInput === draft.startInput ||
                    dateInput === draft.endInput;
                  const previewStart = previewEndInput
                    ? previewEndInput < draft.startInput
                      ? previewEndInput
                      : draft.startInput
                    : null;
                  const previewEnd = previewEndInput
                    ? previewEndInput < draft.startInput
                      ? draft.startInput
                      : previewEndInput
                    : null;
                  const previewed = Boolean(
                    previewStart &&
                      previewEnd &&
                      dateInput >= previewStart &&
                      dateInput <= previewEnd,
                  );
                  const today = dateInput === maximumInput;

                  return (
                    <div
                      key={dateInput}
                      role="gridcell"
                      aria-disabled={disabled || undefined}
                      aria-selected={selected}
                      className="flex justify-center"
                    >
                      <button
                        type="button"
                        data-occupancy-day={dateInput}
                        aria-current={today ? "date" : undefined}
                        aria-label={formatAccessibleDate(date)}
                        disabled={disabled}
                        tabIndex={dateInput === focusedInput ? 0 : -1}
                        onClick={() => onSelect(dateInput)}
                        onFocus={() => onDayPreview(dateInput)}
                        onKeyDown={(event) =>
                          onDayKeyDown(event, dateInput)
                        }
                        onMouseEnter={() => {
                          if (!disabled) onDayPreview(dateInput);
                        }}
                        className={cn(
                          "relative flex h-9 w-9 items-center justify-center rounded-md text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          selected && "bg-primary/10 text-primary",
                          previewed &&
                            !selected &&
                            "bg-primary/5 text-primary",
                          boundary &&
                            "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                          today &&
                            !boundary &&
                            "ring-1 ring-inset ring-primary/50",
                          !selected && !disabled && "hover:bg-muted",
                          disabled &&
                            "cursor-not-allowed text-muted-foreground/35",
                        )}
                      >
                        {date.getDate()}
                      </button>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function formatAnalysisDateRangeLabel(
  range: OccupancyAnalysisDateRangeInput,
) {
  const start = parseOccupancyAnalysisDateInput(range.startInput);
  const end = parseOccupancyAnalysisDateInput(range.endInput);
  if (!start || !end) return "Período inválido";
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: start.getFullYear() === end.getFullYear() ? undefined : "numeric",
  });
  const endFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return range.startInput === range.endInput
    ? endFormatter.format(start)
    : `${formatter.format(start)} – ${endFormatter.format(end)}`;
}

export const formatOccupancyAnalysisRangeLabel =
  formatAnalysisDateRangeLabel;

function formatRangeDayCount(range: OccupancyAnalysisDateRangeInput) {
  try {
    const count = countOccupancyAnalysisDateRangeDays(
      range.startInput,
      range.endInput,
    );
    return count === 1 ? "1 dia" : `${count} dias`;
  } catch {
    return "intervalo incompleto";
  }
}

function validateDraftRange(
  range: OccupancyAnalysisDateRangeInput,
  maximumInput: string,
  maximumDays?: number,
) {
  if (
    !parseOccupancyAnalysisDateInput(range.startInput) ||
    !parseOccupancyAnalysisDateInput(range.endInput)
  ) {
    return "Informe datas de início e fim válidas.";
  }
  if (range.startInput > range.endInput) {
    return "A data inicial deve ser anterior ou igual à data final.";
  }
  if (range.endInput > maximumInput) {
    return "O período não pode incluir datas futuras.";
  }
  if (
    maximumDays &&
    countOccupancyAnalysisDateRangeDays(
      range.startInput,
      range.endInput,
    ) > maximumDays
  ) {
    return `Selecione no máximo ${maximumDays} dias.`;
  }
  return "";
}

function buildRangePresets(maximumDate: Date) {
  const maximumInput = formatOccupancyAnalysisDateInput(maximumDate);
  const currentMonthStart = startOfMonth(maximumDate);
  const currentWeekStart = startOfWeek(maximumDate);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);
  const previousMonthStart = addMonths(currentMonthStart, -1);
  const previousMonthEnd = new Date(currentMonthStart);
  previousMonthEnd.setDate(previousMonthEnd.getDate() - 1);

  return [
    preset("Hoje", maximumInput, maximumInput),
    preset(
      "Ontem",
      shiftOccupancyAnalysisDateInput(maximumInput, -1),
      shiftOccupancyAnalysisDateInput(maximumInput, -1),
    ),
    preset(
      "Últimos 7 dias",
      shiftOccupancyAnalysisDateInput(maximumInput, -6),
      maximumInput,
    ),
    preset(
      "Últimos 30 dias",
      shiftOccupancyAnalysisDateInput(maximumInput, -29),
      maximumInput,
    ),
    preset(
      "Esta semana",
      formatOccupancyAnalysisDateInput(currentWeekStart),
      maximumInput,
    ),
    preset(
      "Semana passada",
      formatOccupancyAnalysisDateInput(previousWeekStart),
      formatOccupancyAnalysisDateInput(previousWeekEnd),
    ),
    preset(
      "Mês atual",
      formatOccupancyAnalysisDateInput(currentMonthStart),
      maximumInput,
    ),
    preset(
      "Mês anterior",
      formatOccupancyAnalysisDateInput(previousMonthStart),
      formatOccupancyAnalysisDateInput(previousMonthEnd),
    ),
  ];
}

function preset(label: string, startInput: string, endInput: string) {
  return { label, range: { endInput, startInput } };
}

function calendarMonthSlots(month: Date) {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  const slots: Array<Date | null> = Array.from({ length: 42 }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    slots[offset + day - 1] = new Date(
      first.getFullYear(),
      first.getMonth(),
      day,
      12,
    );
  }
  return slots;
}

function formatAccessibleDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
  }).format(date);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function startOfWeek(date: Date) {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function shiftMonthClamped(dateInput: string, amount: number) {
  const date = parseOccupancyAnalysisDateInput(dateInput);
  if (!date) return dateInput;
  const targetMonth = new Date(
    date.getFullYear(),
    date.getMonth() + amount,
    1,
    12,
  );
  const lastDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
    12,
  ).getDate();
  return formatOccupancyAnalysisDateInput(
    new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      Math.min(date.getDate(), lastDay),
      12,
    ),
  );
}

function sameMonth(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function focusCalendarDate(root: HTMLElement | null, dateInput: string) {
  window.requestAnimationFrame(() => {
    root?.querySelector<HTMLButtonElement>(
        `[data-occupancy-day="${dateInput}"]`,
      )
      ?.focus();
  });
}
