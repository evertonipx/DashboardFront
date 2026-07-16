"use client";

import * as React from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Scenario } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

type ScenarioSelectionMode = "all" | "custom";

type ScenarioPickerProps = {
  allowAll?: boolean;
  className?: string;
  label?: string;
  loading?: boolean;
  mode: ScenarioSelectionMode;
  onModeChange: (mode: ScenarioSelectionMode) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  scenarios: Scenario[];
  selectedIds: string[];
};

export function ScenarioPicker({
  allowAll = true,
  className,
  label = "Cenários",
  loading = false,
  mode,
  onModeChange,
  onSelectedIdsChange,
  scenarios,
  selectedIds,
}: ScenarioPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selectedIdSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
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
      ? `Todos os cenários (${formatNumber(scenarios.length)})`
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
      onSelectedIdsChange(selectedIds.filter((id) => id !== scenarioId));
      return;
    }

    onSelectedIdsChange([...selectedIds, scenarioId]);
  }

  function selectFiltered() {
    const nextIds = new Set(selectedIds);
    filteredScenarios.forEach((scenario) => nextIds.add(scenario.id));
    onSelectedIdsChange(Array.from(nextIds));
  }

  function removeFiltered() {
    const filteredIds = new Set(filteredScenarios.map((scenario) => scenario.id));
    onSelectedIdsChange(selectedIds.filter((id) => !filteredIds.has(id)));
  }

  return (
    <div className={cn("rounded-md border bg-background p-2", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </div>
          <div className="truncate text-sm font-semibold">{selectedSummary}</div>
        </div>
        {allowAll ? (
          <div className="grid grid-cols-2 gap-2 sm:w-[220px]">
            <Button
              type="button"
              size="sm"
              variant={mode === "all" ? "default" : "outline"}
              onClick={selectAll}
            >
              Todos
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "custom" ? "default" : "outline"}
              onClick={chooseCustom}
            >
              Escolher
            </Button>
          </div>
        ) : null}
      </div>

      {mode === "custom" ? (
        <div className="mt-2 rounded-md bg-muted/20 p-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {selectedScenarios.slice(0, 4).map((scenario) => (
                <Badge
                  key={scenario.id}
                  variant="outline"
                  className="max-w-[180px] truncate bg-card"
                  title={scenario.name}
                >
                  {scenario.name}
                </Badge>
              ))}
              {selectedScenarios.length > 4 ? (
                <Badge variant="secondary">
                  +{formatNumber(selectedScenarios.length - 4)}
                </Badge>
              ) : null}
              {!selectedScenarios.length ? (
                <span className="text-xs text-muted-foreground">
                  Abra a lista para escolher os cenários.
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", open && "rotate-180")}
              />
              {open ? "Recolher" : "Editar"}
            </Button>
          </div>

          {open ? (
            <div className="mt-2 rounded-md border bg-card p-2">
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Filtrar por palavras: entrada, saída..."
                    className="pl-9"
                  />
                </div>
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSelectedIdsChange([])}
                  disabled={!selectedIds.length}
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar
                </Button>
              </div>

              <div className="mt-2 max-h-[260px] overflow-y-auto rounded-md border bg-background p-1">
                {loading ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    Carregando cenários...
                  </div>
                ) : filteredScenarios.length ? (
                  <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredScenarios.map((scenario) => {
                      const selected = selectedIdSet.has(scenario.id);

                      return (
                        <button
                          key={scenario.id}
                          type="button"
                          className={cn(
                            "min-w-0 rounded-md border px-3 py-2 text-left text-sm transition",
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
                            {formatNumber(scenario.lines?.length ?? 0)} linhas
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    Nenhum cenário encontrado.
                  </div>
                )}
              </div>

              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" onClick={() => setOpen(false)}>
                  Concluir
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
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
