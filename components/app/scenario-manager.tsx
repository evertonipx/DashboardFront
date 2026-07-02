"use client";

import * as React from "react";
import {
  Edit,
  ListChecks,
  Plus,
  RefreshCw,
  Route,
  Save,
  Trash2,
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
  withCompanyScope,
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
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={openCreateDialog}
                  >
                    <Plus className="h-4 w-4" />
                    Novo cenário
                  </Button>
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
  const [loadingOptions, setLoadingOptions] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    setName(scenario?.name ?? "");
    setDescription(scenario?.description ?? "");
    setActive(String(scenario?.active ?? true));
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

        if (mounted) {
          setLineOptions(
            lineGroups
              .flat()
              .filter((line) => line.active !== false && !isOccupancyAreaLineCount(line)),
          );
        }
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
          body: withCompanyScope(payload, companyScopeId),
        });
        toast.success("Cenário atualizado");
      } else {
        await apiFetch("/scenarios", {
          method: "POST",
          body: withCompanyScope(payload, companyScopeId),
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

function emptyLine(): FormLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    line_count_id: "",
    action_multiplier: "1",
    label: "",
  };
}
