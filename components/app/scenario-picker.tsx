"use client";

import * as React from "react";
import { ChevronDown, Search, X } from "lucide-react";

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
import { cn, formatNumber } from "@/lib/utils";

type ScenarioSelectionMode = "all" | "custom";

export type ScenarioPickerOption = {
  description?: string;
  id: string;
  lines?: readonly unknown[];
  name: string;
};

export type ScenarioPickerProps = {
  allowAll?: boolean;
  className?: string;
  initiallyOpen?: boolean;
  label?: string;
  loading?: boolean;
  maxSelected?: number;
  mode: ScenarioSelectionMode;
  nounPlural?: string;
  nounSingular?: string;
  onModeChange: (mode: ScenarioSelectionMode) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  scenarios: ScenarioPickerOption[];
  selectedIds: string[];
  summaryForItem?: (scenario: ScenarioPickerOption) => string;
};

export function ScenarioPicker({
  allowAll = true,
  className,
  initiallyOpen = false,
  label = "Cenários",
  loading = false,
  maxSelected,
  mode,
  nounPlural = "cenários",
  nounSingular = "cenário",
  onModeChange,
  onSelectedIdsChange,
  scenarios,
  selectedIds,
  summaryForItem,
}: ScenarioPickerProps) {
  const selectionLimit = normalizeSelectionLimit(maxSelected);
  const effectiveSelectedIds = React.useMemo(
    () =>
      selectionLimit ? selectedIds.slice(0, selectionLimit) : selectedIds,
    [selectedIds, selectionLimit],
  );
  const [open, setOpen] = React.useState(
    () => initiallyOpen && mode === "custom",
  );
  const [search, setSearch] = React.useState("");
  const selectedIdSet = React.useMemo(
    () => new Set(effectiveSelectedIds),
    [effectiveSelectedIds],
  );
  const selectedScenarios = React.useMemo(
    () => scenarios.filter((scenario) => selectedIdSet.has(scenario.id)),
    [scenarios, selectedIdSet],
  );
  const filteredScenarios = React.useMemo(() => {
    const normalizedSearch = normalizeSearch(search);
    if (!normalizedSearch) return scenarios;
    const terms = normalizedSearch
      .split(/[\s,;|]+/)
      .filter((term) => term.length > 1 && term !== "ou");
    if (!terms.length) return scenarios;

    return scenarios.filter((scenario) => {
      const searchable = normalizeSearch(
        `${scenario.name} ${scenario.description ?? ""}`,
      );
      return terms.some((term) => searchable.includes(term));
    });
  }, [scenarios, search]);
  const selectedSummary =
    mode === "all"
    ? `Todos os ${nounPlural} (${formatNumber(scenarios.length)})`
      : selectedScenarios.length
        ? `${formatNumber(selectedScenarios.length)} selecionado(s)`
        : "Nenhum selecionado";

  React.useEffect(() => {
    if (mode === "all") {
      setOpen(false);
      setSearch("");
    }
  }, [mode]);

  function selectAll() {
    onModeChange("all");
  }

  function chooseCustom() {
    onModeChange("custom");
    setOpen(true);
  }

  function toggleScenario(scenarioId: string) {
    if (selectedIdSet.has(scenarioId)) {
      onSelectedIdsChange(
        effectiveSelectedIds.filter((id) => id !== scenarioId),
      );
      return;
    }

    onSelectedIdsChange(
      selectionLimit === 1
        ? [scenarioId]
        : [...effectiveSelectedIds, scenarioId],
    );
  }

  function selectFiltered() {
    const nextIds = new Set(effectiveSelectedIds);
    filteredScenarios.forEach((scenario) => nextIds.add(scenario.id));
    onSelectedIdsChange(
      selectionLimit
        ? Array.from(nextIds).slice(0, selectionLimit)
        : Array.from(nextIds),
    );
  }

  function removeFiltered() {
    const filteredIds = new Set(filteredScenarios.map((scenario) => scenario.id));
    onSelectedIdsChange(
      effectiveSelectedIds.filter((id) => !filteredIds.has(id)),
    );
  }

  return (
    <div
      data-scenario-picker
      className={cn(
        "@container min-w-0 overflow-hidden rounded-md border bg-background p-2",
        className,
      )}
    >
      <div
        data-scenario-picker-heading
        className="flex flex-col gap-2"
      >
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </div>
          <div
            className="truncate text-sm font-semibold"
            title={selectedSummary}
          >
            {selectedSummary}
          </div>
        </div>
        {allowAll ? (
          <div
            data-scenario-picker-mode
            className="grid w-full grid-cols-2 gap-1.5"
          >
            <Button
              type="button"
              size="sm"
              className="h-8 min-w-0 px-2 text-xs"
              variant={mode === "all" ? "default" : "outline"}
              onClick={selectAll}
              aria-pressed={mode === "all"}
            >
              Todos
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 min-w-0 px-2 text-xs"
              variant={mode === "custom" ? "default" : "outline"}
              onClick={chooseCustom}
              aria-pressed={mode === "custom"}
            >
              Escolher
            </Button>
          </div>
        ) : null}
      </div>

      {mode === "custom" ? (
        <div className="mt-1.5 min-w-0 rounded-md bg-muted/20 p-1.5">
          <div
            data-scenario-picker-selection
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5"
          >
            <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
              {selectedScenarios.slice(0, 2).map((scenario) => (
                <Badge
                  key={scenario.id}
                  variant="outline"
                  className="min-w-0 max-w-28 truncate bg-card px-1.5 @sm:max-w-36"
                  title={scenario.name}
                >
                  {scenario.name}
                </Badge>
              ))}
              {selectedScenarios.length > 2 ? (
                <Badge variant="secondary" className="shrink-0 px-1.5">
                  +{formatNumber(selectedScenarios.length - 2)}
                </Badge>
              ) : null}
              {!selectedScenarios.length ? (
                <span className="truncate text-xs text-muted-foreground">
                  Abra a lista para escolher {nounPlural}.
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 px-2 text-xs"
              data-scenario-picker-edit
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={`${open ? "Recolher" : "Editar"} seleção de ${label}`}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", open && "rotate-180")}
              />
              {open ? "Recolher" : "Editar"}
            </Button>
          </div>

        </div>
      ) : null}

      <Dialog
        open={open && mode === "custom"}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSearch("");
        }}
      >
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden p-3 sm:max-w-4xl sm:p-4">
          <DialogHeader className="min-w-0 pr-8">
            <DialogTitle className="break-words">Selecionar {label}</DialogTitle>
            <DialogDescription>
              {formatNumber(selectedScenarios.length)} de {formatNumber(scenarios.length)} {nounPlural} selecionado(s)
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Filtrar ${nounPlural} por palavras...`}
                className="pl-9"
              />
            </div>
            {selectionLimit === 1 ? null : (
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:flex lg:shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={selectFiltered}
                  disabled={!filteredScenarios.length}
                >
                  Selecionar filtrados
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={removeFiltered}
                  disabled={
                    !filteredScenarios.some((scenario) =>
                      selectedIdSet.has(scenario.id),
                    )
                  }
                >
                  Remover filtrados
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto rounded-md border bg-background p-1">
            {loading ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Carregando cenários...
              </div>
            ) : filteredScenarios.length ? (
              <div
                role="group"
                aria-label={`${label} disponíveis`}
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-1"
              >
                {filteredScenarios.map((scenario) => {
                  const selected = selectedIdSet.has(scenario.id);

                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "min-w-0 rounded-md border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-transparent bg-card hover:border-primary/40",
                      )}
                      onClick={() => toggleScenario(scenario.id)}
                    >
                      <span className="block truncate font-medium">
                        {scenario.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {summaryForItem
                          ? summaryForItem(scenario)
                          : `${formatNumber(scenario.lines?.length ?? 0)} linhas`}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Nenhum {nounSingular} encontrado.
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSelectedIdsChange([])}
              disabled={!effectiveSelectedIds.length}
            >
              <X className="h-3.5 w-3.5" />
              Limpar seleção
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeSelectionLimit(value: number | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}
