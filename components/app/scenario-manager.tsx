"use client";

import * as React from "react";
import {
  Check,
  Edit,
  ListChecks,
  ListPlus,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OccupancyScenarioManager } from "@/components/app/occupancy-scenario-manager";
import { apiFetch } from "@/lib/api";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import { isOccupancyAreaLineCount } from "@/lib/occupancy-area-options";
import { canManageScenarios } from "@/lib/permissions";
import type {
  Camera,
  CameraLineCount,
  Scenario,
  ScenarioLine,
  ScenarioPayload,
  ScenarioResult,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

type ResultMap = Record<string, ScenarioResult | null>;

type LineOption = CameraLineCount & {
  cameraName: string;
};

type FormLine = {
  key: string;
  line_count_id: string;
  action_multiplier: "-1" | "0" | "1";
  label: string;
};

export function ScenarioManager() {
  const { user } = useAuth();
  const canEditScenarios = canManageScenarios(user);
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [results, setResults] = React.useState<ResultMap>({});
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const [editingScenario, setEditingScenario] = React.useState<Scenario | null>(
    null,
  );

  const loadScenarios = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Scenario[]>("/scenarios");
      const scopedScenarios = filterScopedApiRows(data, companyScopeId);
      setScenarios(scopedScenarios);

      const entries = await Promise.all(
        scopedScenarios.map(async (scenario) => {
          try {
            const result = await apiFetch<ScenarioResult>(
              `/scenarios/${scenario.id}/result`,
            );
            return [scenario.id, result] as const;
          } catch {
            return [scenario.id, null] as const;
          }
        }),
      );
      setResults(Object.fromEntries(entries));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os cenários.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [companyScopeId]);

  React.useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  function openCreateDialog() {
    if (!canEditScenarios) {
      toast.error("Seu usuário não pode alterar cenários.");
      return;
    }

    setEditingScenario(null);
    setDialogOpen(true);
  }

  function openEditDialog(scenario: Scenario) {
    if (!canEditScenarios) {
      toast.error("Seu usuário não pode alterar cenários.");
      return;
    }

    setEditingScenario(scenario);
    setDialogOpen(true);
  }

  async function deleteScenario(scenario: Scenario) {
    if (!canEditScenarios) {
      toast.error("Seu usuário não pode alterar cenários.");
      return;
    }

    if (!window.confirm(`Excluir o cenário "${scenario.name}"?`)) return;

    try {
      await apiFetch(`/scenarios/${scenario.id}`, { method: "DELETE" });
      toast.success("Cenário excluído");
      await loadScenarios();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível excluir.";
      toast.error(message);
    }
  }

  async function handleSaved() {
    setDialogOpen(false);
    await loadScenarios();
  }

  return (
    <section className="space-y-4">
      <Tabs defaultValue="flow" className="space-y-4">
        <TabsList>
          <TabsTrigger value="flow">Contagem</TabsTrigger>
          <TabsTrigger value="occupancy">Ocupação</TabsTrigger>
        </TabsList>

        <TabsContent value="flow">
          <Card id="config-cenarios" className="scroll-mt-6">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Cenários de contagem
                </CardTitle>
                <CardDescription className="mt-1">
                  Configure os cenários de contagem usados por ao vivo e relatórios.
                </CardDescription>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={loadScenarios}
                  disabled={loading}
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  Atualizar
                </Button>
                {canEditScenarios ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setBulkDialogOpen(true)}
                    >
                      <ListPlus className="h-4 w-4" />
                      Criar por linha
                    </Button>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={openCreateDialog}
                    >
                      <Plus className="h-4 w-4" />
                      Novo cenário
                    </Button>
                  </>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : scenarios.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Linhas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Resultado hoje</TableHead>
                      <TableHead>Atualizado</TableHead>
                      {canEditScenarios ? (
                        <TableHead className="text-right">Ações</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scenarios.map((scenario) => (
                      <TableRow key={scenario.id}>
                        <TableCell>
                          <div className="font-medium">{scenario.name}</div>
                          <div className="mt-1 max-w-[420px] truncate text-xs text-muted-foreground">
                            {scenario.description || scenario.id}
                          </div>
                        </TableCell>
                        <TableCell>{scenario.lines?.length ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={scenario.active ? "success" : "secondary"}>
                            {scenario.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {results[scenario.id] ? (
                            <div className="font-medium">
                              {formatNumber(results[scenario.id]?.result)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(scenario.updated_at ?? scenario.created_at)}
                        </TableCell>
                        {canEditScenarios ? (
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(scenario)}
                              >
                                <Edit className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteScenario(scenario)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Excluir
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  {canEditScenarios
                    ? "Nenhum cenário cadastrado. Crie o primeiro filtro para o dashboard."
                    : "Nenhum cenário cadastrado."}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="occupancy">
          <OccupancyScenarioManager />
        </TabsContent>
      </Tabs>

      <ScenarioDialog
        open={dialogOpen}
        scenario={editingScenario}
        companyScopeId={companyScopeId}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />
      <BulkScenarioDialog
        companyScopeId={companyScopeId}
        onOpenChange={setBulkDialogOpen}
        onSaved={loadScenarios}
        open={bulkDialogOpen}
        scenarios={scenarios}
      />
    </section>
  );
}

function ScenarioDialog({
  open,
  scenario,
  companyScopeId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  scenario: Scenario | null;
  companyScopeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [active, setActive] = React.useState("true");
  const [lines, setLines] = React.useState<FormLine[]>([]);
  const [lineOptions, setLineOptions] = React.useState<LineOption[]>([]);
  const [lineSearch, setLineSearch] = React.useState("");
  const [loadingOptions, setLoadingOptions] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    setName(scenario?.name ?? "");
    setDescription(scenario?.description ?? "");
    setActive(String(scenario?.active ?? true));
    setLineSearch("");
    setLines(
      scenario?.lines?.length
        ? scenario.lines.map((line, index) => ({
            key: `${line.line_count_id}-${index}`,
            line_count_id: line.line_count_id,
            action_multiplier: String(line.action_multiplier) as "-1" | "0" | "1",
            label: line.label ?? "",
          }))
        : [emptyLine()],
    );
  }, [open, scenario]);

  React.useEffect(() => {
    if (!open) return;

    let mounted = true;

    async function loadLineOptions() {
      setLoadingOptions(true);
      try {
        const options = await loadCountingLineOptions(companyScopeId);
        if (mounted) setLineOptions(options);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as linhas.";
        toast.error(message);
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    }

    loadLineOptions();

    return () => {
      mounted = false;
    };
  }, [companyScopeId, open]);

  const filteredLineOptions = React.useMemo(
    () => filterLineOptions(lineOptions, lineSearch),
    [lineOptions, lineSearch],
  );

  function updateLine(key: string, patch: Partial<FormLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) =>
      current.length === 1 ? [emptyLine()] : current.filter((line) => line.key !== key),
    );
  }

  function addLineOptions(options: LineOption[]) {
    setLines((current) => {
      const selectedIds = new Set(
        current.map((line) => line.line_count_id).filter(Boolean),
      );
      const additions = options
        .filter((option) => !selectedIds.has(option.id))
        .map(formLineFromOption);
      if (!additions.length) return current;

      return [
        ...current.filter((line) => line.line_count_id),
        ...additions,
      ];
    });
  }

  async function saveScenario() {
    const cleanName = name.trim();
    const cleanLines = lines
      .filter((line) => line.line_count_id)
      .map<ScenarioLine>((line) => ({
        line_count_id: line.line_count_id,
        action_multiplier: Number(line.action_multiplier) as -1 | 0 | 1,
        label: line.label.trim() || undefined,
      }));

    if (!cleanName) {
      toast.error("Nome obrigatório");
      return;
    }

    if (!cleanLines.length) {
      toast.error("Adicione pelo menos uma linha de contagem");
      return;
    }

    const payload: ScenarioPayload = {
      name: cleanName,
      description: description.trim() || undefined,
      scenario_type: scenario?.scenario_type || "custom",
      lines: cleanLines,
    };

    if (scenario) {
      payload.active = active === "true";
    }

    setSaving(true);
    try {
      if (scenario) {
        await apiFetch(`/scenarios/${scenario.id}`, {
          method: "PUT",
          body: payload,
        });
        toast.success("Cenário atualizado");
      } else {
        await apiFetch("/scenarios", {
          method: "POST",
          body: payload,
        });
        toast.success("Cenário criado");
      }

      await onSaved();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{scenario ? "Editar cenário" : "Novo cenário"}</DialogTitle>
          <DialogDescription>
            Configure as linhas que compõem este cenário.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Nome</Label>
            <Input
              id="scenario-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Fluxo entrada principal"
            />
          </div>
          {scenario ? (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={active} onValueChange={setActive}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="scenario-description">Descrição</Label>
          <Textarea
            id="scenario-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Contexto operacional do filtro"
          />
        </div>

        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Route className="h-4 w-4 text-primary" />
                Linhas de contagem
                <Badge variant="outline">
                  {lines.filter((line) => line.line_count_id).length} selecionadas
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cada linha define sua contribuição no resultado final.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar linha
            </Button>
          </div>

          {!loadingOptions && lineOptions.length ? (
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={lineSearch}
                  onChange={(event) => setLineSearch(event.target.value)}
                  placeholder="Filtrar por linha, câmera ou código"
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => addLineOptions(filteredLineOptions)}
                disabled={!lineSearch.trim() || !filteredLineOptions.length}
              >
                <ListPlus className="h-4 w-4" />
                Adicionar filtradas
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => addLineOptions(lineOptions)}
                disabled={
                  lineOptions.every((option) =>
                    lines.some((line) => line.line_count_id === option.id),
                  )
                }
              >
                <Check className="h-4 w-4" />
                Adicionar todas
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLines([emptyLine()])}
                disabled={!lines.some((line) => line.line_count_id)}
              >
                <X className="h-4 w-4" />
                Limpar
              </Button>
              {lineSearch.trim() ? (
                <div className="text-xs text-muted-foreground lg:col-span-4">
                  {filteredLineOptions.length} de {lineOptions.length} linhas correspondem ao filtro.
                </div>
              ) : null}
            </div>
          ) : null}

          {loadingOptions ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : lineOptions.length ? (
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-[1fr_150px_1fr_44px]"
                >
                  <div className="space-y-2">
                    <Label className="text-xs">Linha</Label>
                    <Select
                      value={line.line_count_id}
                      onValueChange={(value) =>
                        updateLine(line.key, { line_count_id: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Linha ${index + 1}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {lineOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.cameraName} / {option.name} ({option.line_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Operação</Label>
                    <Select
                      value={line.action_multiplier}
                      onValueChange={(value) =>
                        updateLine(line.key, {
                          action_multiplier: value as "-1" | "0" | "1",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Soma</SelectItem>
                        <SelectItem value="-1">Subtrai</SelectItem>
                        <SelectItem value="0">Neutro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Rótulo</Label>
                    <Input
                      value={line.label}
                      onChange={(event) =>
                        updateLine(line.key, { label: event.target.value })
                      }
                      placeholder="Ex: Entrada"
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      aria-label="Remover linha"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma linha ativa encontrada. Cadastre line counts nas câmeras
              antes de criar cenários.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={saveScenario} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar cenário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkScenarioDialog({
  companyScopeId,
  onOpenChange,
  onSaved,
  open,
  scenarios,
}: {
  companyScopeId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  open: boolean;
  scenarios: Scenario[];
}) {
  const [lineOptions, setLineOptions] = React.useState<LineOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [prefix, setPrefix] = React.useState("");
  const [nameMode, setNameMode] = React.useState<"line" | "camera_line">(
    "camera_line",
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [createdCount, setCreatedCount] = React.useState(0);
  const individualScenarioLineIds = React.useMemo(
    () =>
      new Set(
        scenarios.flatMap((scenario) =>
          scenario.lines?.length === 1
            ? [scenario.lines[0]?.line_count_id].filter(
                (id): id is string => Boolean(id),
              )
            : [],
        ),
      ),
    [scenarios],
  );
  const filteredOptions = React.useMemo(
    () => filterLineOptions(lineOptions, search),
    [lineOptions, search],
  );
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const availableOptions = lineOptions.filter(
    (option) => !individualScenarioLineIds.has(option.id),
  );

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;

    setSearch("");
    setPrefix("");
    setSelectedIds([]);
    setCreatedCount(0);
    setLoading(true);
    loadCountingLineOptions(companyScopeId)
      .then((options) => {
        if (mounted) setLineOptions(options);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as linhas de contagem.",
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [companyScopeId, open]);

  function toggleLine(lineId: string) {
    setSelectedIds((current) =>
      current.includes(lineId)
        ? current.filter((id) => id !== lineId)
        : [...current, lineId],
    );
  }

  function selectOptions(options: LineOption[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      options.forEach((option) => {
        if (!individualScenarioLineIds.has(option.id)) next.add(option.id);
      });
      return Array.from(next);
    });
  }

  async function createScenarios() {
    const selectedOptions = lineOptions.filter(
      (option) =>
        selectedSet.has(option.id) && !individualScenarioLineIds.has(option.id),
    );
    if (!selectedOptions.length) {
      toast.error("Selecione pelo menos uma linha sem cenário individual.");
      return;
    }

    setSaving(true);
    setCreatedCount(0);
    const usedNames = new Set(
      scenarios.map((scenario) => normalizeSearchText(scenario.name)),
    );
    const failedIds: string[] = [];
    let created = 0;

    try {
      for (let index = 0; index < selectedOptions.length; index += 4) {
        const chunk = selectedOptions.slice(index, index + 4);
        const results = await Promise.allSettled(
          chunk.map((option) => {
            const payload: ScenarioPayload = {
              description: `Cenário individual criado para ${option.cameraName} / ${option.name}.`,
              lines: [
                {
                  action_multiplier: 1,
                  label: option.name,
                  line_count_id: option.id,
                },
              ],
              name: buildUniqueScenarioName(
                option,
                nameMode,
                prefix,
                usedNames,
              ),
              scenario_type: "custom",
            };
            return apiFetch("/scenarios", {
              body: payload,
              method: "POST",
            });
          }),
        );

        results.forEach((result, resultIndex) => {
          if (result.status === "fulfilled") created += 1;
          else if (chunk[resultIndex]) failedIds.push(chunk[resultIndex].id);
        });
        setCreatedCount(created);
      }

      await onSaved();
      if (failedIds.length) {
        setSelectedIds(failedIds);
        toast.error(
          `${created} cenário(s) criado(s); ${failedIds.length} falharam e continuam selecionados.`,
        );
      } else {
        toast.success(`${created} cenário(s) criado(s) por linha.`);
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Criar um cenário por linha</DialogTitle>
          <DialogDescription>
            Selecione as linhas e gere cenários individuais em lote.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bulk-scenario-prefix">Prefixo opcional</Label>
            <Input
              id="bulk-scenario-prefix"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="Ex: Acesso"
            />
          </div>
          <div className="space-y-2">
            <Label>Formato do nome</Label>
            <Select
              value={nameMode}
              onValueChange={(value) =>
                setNameMode(value as "line" | "camera_line")
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="camera_line">Câmera - linha</SelectItem>
                <SelectItem value="line">Somente linha</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filtrar por entrada, saída, câmera ou código"
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectOptions(filteredOptions)}
              disabled={!filteredOptions.some(
                (option) => !individualScenarioLineIds.has(option.id),
              )}
            >
              Selecionar filtradas
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectOptions(availableOptions)}
              disabled={!availableOptions.length}
            >
              Selecionar todas
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedIds([])}
              disabled={!selectedIds.length}
            >
              <X className="h-4 w-4" />
              Limpar
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{selectedIds.length} selecionadas</Badge>
            <span>{availableOptions.length} disponíveis</span>
            {individualScenarioLineIds.size ? (
              <span>{individualScenarioLineIds.size} já possuem cenário individual</span>
            ) : null}
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-md border p-1">
          {loading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredOptions.length ? (
            <div className="grid gap-1 md:grid-cols-2">
              {filteredOptions.map((option) => {
                const alreadyCreated = individualScenarioLineIds.has(option.id);
                const selected = selectedSet.has(option.id);

                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex min-w-0 items-start gap-3 rounded-md border px-3 py-2",
                      alreadyCreated
                        ? "cursor-not-allowed bg-muted/40 opacity-65"
                        : "cursor-pointer bg-card hover:border-primary/40",
                      selected && "border-primary bg-primary/10",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={selected}
                      disabled={alreadyCreated}
                      onChange={() => toggleLine(option.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {option.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.cameraName} · {option.line_code}
                      </span>
                    </span>
                    {alreadyCreated ? (
                      <Badge variant="secondary">Criado</Badge>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma linha corresponde ao filtro.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={createScenarios}
            disabled={saving || !selectedIds.length}
          >
            <ListPlus className="h-4 w-4" />
            {saving
              ? `Criando ${createdCount}/${selectedIds.length}...`
              : `Criar ${selectedIds.length} cenário(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function loadCountingLineOptions(companyScopeId: string) {
  const cameras = filterScopedApiRows(
    await apiFetch<Camera[]>("/cameras"),
    companyScopeId,
  );
  const lineGroups = await Promise.all(
    cameras.map(async (camera) => {
      try {
        const cameraLines = await apiFetch<CameraLineCount[]>(
          `/cameras/${camera.id}/line-counts`,
        );
        return filterScopedApiRows(cameraLines, companyScopeId).map((line) => ({
          ...line,
          cameraName: camera.name,
        }));
      } catch {
        return [];
      }
    }),
  );

  return lineGroups
    .flat()
    .filter((line) => line.active !== false && !isOccupancyAreaLineCount(line))
    .sort(
      (left, right) =>
        left.cameraName.localeCompare(right.cameraName, "pt-BR") ||
        left.name.localeCompare(right.name, "pt-BR"),
    );
}

function filterLineOptions(options: LineOption[], search: string) {
  const terms = normalizeSearchText(search)
    .split(/[\s,;|]+/)
    .filter((term) => term.length > 1 && term !== "ou");
  if (!terms.length) return options;

  return options.filter((option) => {
    const searchable = normalizeSearchText(
      `${option.name} ${option.cameraName} ${option.line_code}`,
    );
    return terms.some((term) => searchable.includes(term));
  });
}

function buildUniqueScenarioName(
  option: LineOption,
  mode: "line" | "camera_line",
  prefix: string,
  usedNames: Set<string>,
) {
  const base = mode === "line" ? option.name : `${option.cameraName} - ${option.name}`;
  const cleanPrefix = prefix.trim();
  const requested = cleanPrefix ? `${cleanPrefix} ${base}` : base;
  let candidate = requested;
  let suffix = 2;

  if (usedNames.has(normalizeSearchText(candidate))) {
    candidate = `${requested} (${option.line_code})`;
  }
  while (usedNames.has(normalizeSearchText(candidate))) {
    candidate = `${requested} (${option.line_code} ${suffix})`;
    suffix += 1;
  }
  usedNames.add(normalizeSearchText(candidate));
  return candidate;
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formLineFromOption(option: LineOption): FormLine {
  return {
    action_multiplier: "1",
    key: `${option.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: option.name,
    line_count_id: option.id,
  };
}

function emptyLine(): FormLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    line_count_id: "",
    action_multiplier: "1",
    label: "",
  };
}
