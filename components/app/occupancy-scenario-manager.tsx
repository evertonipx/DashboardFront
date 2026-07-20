"use client";

import * as React from "react";
import {
  Edit,
  MapPinned,
  Plus,
  RefreshCw,
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
import { apiFetch } from "@/lib/api";
import {
  filterScopedApiRows,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import {
  buildOccupancyAreaKey,
  type OccupancyAreaOption,
} from "@/lib/occupancy-areas";
import { fetchOccupancyAreaOptions } from "@/lib/occupancy-area-options";
import { canManageOccupancy, canManageScenarios } from "@/lib/permissions";
import type {
  OccupancyScenario,
  OccupancyScenarioArea,
  OccupancyScenarioListResponse,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

type AreaOption = OccupancyAreaOption;

type Draft = {
  id?: string;
  active: boolean;
  areas: OccupancyScenarioArea[];
  max_total: string;
  min_total: string;
  name: string;
  object_class: string;
};

const MANUAL_AREA_OPTION = "__manual__";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function OccupancyScenarioManager() {
  const { user } = useAuth();
  const canEdit = canManageOccupancy(user) || canManageScenarios(user);
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const [scenarios, setScenarios] = React.useState<OccupancyScenario[]>([]);
  const [areaOptions, setAreaOptions] = React.useState<AreaOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingScenario, setEditingScenario] =
    React.useState<OccupancyScenario | null>(null);

  const loadScenarios = React.useCallback(async () => {
    setLoading(true);
    try {
      const response =
        await apiFetch<OccupancyScenarioListResponse>("/occupancy/scenarios");
      setScenarios(
        filterScopedApiRows(normalizeScenarioList(response), companyScopeId),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar cenários de ocupação.",
      );
    } finally {
      setLoading(false);
    }
  }, [companyScopeId]);

  const loadAreaOptions = React.useCallback(async () => {
    const now = new Date();
    try {
      const options = await fetchOccupancyAreaOptions({
        companyId: companyScopeId,
        from: new Date(now.getTime() - 4 * HOUR_MS),
        to: now,
      });
      setAreaOptions(options);
    } catch {
      setAreaOptions([]);
    }
  }, [companyScopeId]);

  React.useEffect(() => {
    loadScenarios();
    loadAreaOptions();
  }, [loadAreaOptions, loadScenarios]);

  function openCreateDialog() {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }

    setEditingScenario(null);
    setDialogOpen(true);
  }

  function openEditDialog(scenario: OccupancyScenario) {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }

    setEditingScenario(scenario);
    setDialogOpen(true);
  }

  async function deleteScenario(scenario: OccupancyScenario) {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }

    if (!window.confirm(`Excluir o cenário de ocupação "${scenario.name}"?`)) {
      return;
    }

    try {
      await apiFetch(`/occupancy/scenarios/${scenario.id}`, { method: "DELETE" });
      toast.success("Cenário de ocupação excluído.");
      await loadScenarios();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  async function handleSaved() {
    setDialogOpen(false);
    await loadScenarios();
    await loadAreaOptions();
  }

  return (
    <section className="space-y-4">
      <Card id="config-cenarios-ocupacao" className="scroll-mt-6">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="h-4 w-4" />
              Cenários de ocupação
            </CardTitle>
            <CardDescription className="mt-1">
              Configure cenários de ocupação por câmera, objeto e limites de alerta.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                loadScenarios();
                loadAreaOptions();
              }}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Atualizar
            </Button>
            {canEdit ? (
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
            <TableSkeleton />
          ) : scenarios.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Áreas</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Alertas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atualizado</TableHead>
                  {canEdit ? <TableHead className="text-right">Ações</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map((scenario) => (
                  <TableRow key={scenario.id}>
                    <TableCell>
                      <div className="font-medium">{scenario.name}</div>
                      <div className="mt-1 max-w-[420px] truncate text-xs text-muted-foreground">
                        {scenario.id}
                      </div>
                    </TableCell>
                    <TableCell>{formatNumber(scenario.areas?.length ?? 0)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {scenario.object_class || "person"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {thresholdSummary(scenario)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={scenario.active} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(scenario.updated_at ?? scenario.created_at)}
                    </TableCell>
                    {canEdit ? (
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
              Nenhum cenário de ocupação cadastrado.
              {canEdit ? (
                <div className="mt-4">
                  <Button type="button" onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" />
                    Criar primeiro cenário
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <OccupancyScenarioDialog
        areaOptions={areaOptions}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        open={dialogOpen}
        scenario={editingScenario}
      />
    </section>
  );
}

function OccupancyScenarioDialog({
  areaOptions,
  onOpenChange,
  onSaved,
  open,
  scenario,
}: {
  areaOptions: AreaOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  open: boolean;
  scenario: OccupancyScenario | null;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => createEmptyDraft());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(scenario ? scenarioToDraft(scenario) : createEmptyDraft());
  }, [open, scenario]);

  function updateArea(index: number, patch: Partial<OccupancyScenarioArea>) {
    setDraft((current) => ({
      ...current,
      areas: current.areas.map((area, areaIndex) =>
        areaIndex === index ? { ...area, ...patch } : area,
      ),
    }));
  }

  function addArea() {
    const used = new Set(draft.areas.map(areaKey));
    const option = areaOptions.find((item) => !used.has(item.key)) ?? areaOptions[0];

    setDraft((current) => ({
      ...current,
      areas: [
        ...current.areas,
        option
          ? {
              area_id: option.area_id,
              camera_id: option.camera_id,
              label: option.label,
            }
          : {
              area_id: "",
              camera_id: "",
              label: "",
            },
      ],
    }));
  }

  function removeArea(index: number) {
    setDraft((current) => ({
      ...current,
      areas: current.areas.filter((_, areaIndex) => areaIndex !== index),
    }));
  }

  async function saveScenario() {
    const payload = buildScenarioPayload(draft);

    if (!payload.name) {
      toast.error("Informe o nome do cenário.");
      return;
    }

    if (!payload.object_class) {
      toast.error("Informe a classe de objeto.");
      return;
    }

    if (!payload.areas.length) {
      toast.error("Inclua pelo menos uma área.");
      return;
    }

    if (
      payload.min_total !== undefined &&
      payload.max_total !== undefined &&
      payload.min_total > payload.max_total
    ) {
      toast.error("O mínimo não pode ser maior que o máximo.");
      return;
    }

    setSaving(true);
    try {
      if (draft.id) {
        await apiFetch<OccupancyScenario>(`/occupancy/scenarios/${draft.id}`, {
          method: "PUT",
          body: {
            ...payload,
            active: draft.active,
          },
        });
        toast.success("Cenário de ocupação atualizado.");
      } else {
        await apiFetch<OccupancyScenario>("/occupancy/scenarios", {
          method: "POST",
          body: payload,
        });
        toast.success("Cenário de ocupação criado.");
      }

      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Editar cenário de ocupação" : "Novo cenário de ocupação"}
          </DialogTitle>
          <DialogDescription>
            Configure as áreas por câmera conforme /occupancy/scenarios.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px_150px]">
            <FormField label="Nome">
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Postos de trabalho"
              />
            </FormField>
            <FormField label="Objeto">
              <Input
                value={draft.object_class}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    object_class: event.target.value,
                  }))
                }
                placeholder="person"
              />
            </FormField>
            <FormField label="Mínimo">
              <Input
                min={0}
                type="number"
                value={draft.min_total}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    min_total: event.target.value,
                  }))
                }
                placeholder="0"
              />
            </FormField>
            <FormField label="Máximo">
              <Input
                min={0}
                type="number"
                value={draft.max_total}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    max_total: event.target.value,
                  }))
                }
                placeholder="50"
              />
            </FormField>
          </div>

          {draft.id ? (
            <div className="max-w-[180px]">
              <FormField label="Status">
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.active}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      active: !current.active,
                    }))
                  }
                  className={cn(
                    "flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm transition",
                    draft.active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {draft.active ? "Ativo" : "Inativo"}
                  <span
                    className={cn(
                      "flex h-4 w-7 items-center rounded-full p-0.5 transition",
                      draft.active ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "h-3 w-3 rounded-full bg-background shadow-sm transition",
                        draft.active && "translate-x-3",
                      )}
                    />
                  </span>
                </button>
              </FormField>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Áreas do cenário</div>
                <div className="text-xs text-muted-foreground">
                  Selecione uma área detectada ou preencha câmera e área manualmente.
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addArea}>
                <Plus className="h-3.5 w-3.5" />
                Adicionar área
              </Button>
            </div>

            {draft.areas.length ? (
              <div className="space-y-2">
                {draft.areas.map((area, index) => (
                  <ScenarioAreaEditor
                    key={`${area.camera_id}-${area.area_id}-${index}`}
                    area={area}
                    areaOptions={areaOptions}
                    onPatch={(patch) => updateArea(index, patch)}
                    onRemove={() => removeArea(index)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                Inclua pelo menos uma área no cenário.
              </div>
            )}
          </div>
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

function ScenarioAreaEditor({
  area,
  areaOptions,
  onPatch,
  onRemove,
}: {
  area: OccupancyScenarioArea;
  areaOptions: AreaOption[];
  onPatch: (patch: Partial<OccupancyScenarioArea>) => void;
  onRemove: () => void;
}) {
  const selectedOptionKey =
    areaOptions.find(
      (option) =>
        option.area_id === area.area_id && option.camera_id === area.camera_id,
    )?.key ?? MANUAL_AREA_OPTION;

  return (
    <div className="grid gap-3 rounded-md border bg-card p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <FormField label="Área detectada">
        <Select
          value={selectedOptionKey}
          onValueChange={(value) => {
            if (value === MANUAL_AREA_OPTION) return;
            const option = areaOptions.find((item) => item.key === value);
            if (!option) return;

            onPatch({
              area_id: option.area_id,
              camera_id: option.camera_id,
              label: area.label?.trim() ? area.label : option.label,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={MANUAL_AREA_OPTION}>Manual</SelectItem>
            {areaOptions.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Câmera">
        <Input
          value={area.camera_id}
          onChange={(event) => onPatch({ camera_id: event.target.value })}
          placeholder="camera_id"
        />
      </FormField>
      <FormField label="Área">
        <Input
          value={area.area_id}
          onChange={(event) => onPatch({ area_id: event.target.value })}
          placeholder="area-1"
        />
      </FormField>
      <FormField label="Rótulo">
        <Input
          value={area.label ?? ""}
          onChange={(event) => onPatch({ label: event.target.value })}
          placeholder="Posto 01"
        />
      </FormField>
      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={onRemove}
          aria-label="Remover área"
          title="Remover área"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function FormField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "secondary"}>
      {active ? "Ativo" : "Inativo"}
    </Badge>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

function normalizeScenarioList(response: OccupancyScenarioListResponse) {
  const scenarios = Array.isArray(response) ? response : response.data ?? [];
  return scenarios.map((scenario) => ({
    ...scenario,
    active: scenario.active ?? true,
    areas: scenario.areas ?? [],
    object_class: scenario.object_class || "person",
  }));
}

function buildScenarioPayload(draft: Draft) {
  return {
    areas: draft.areas
      .map((area) => ({
        area_id: area.area_id.trim(),
        camera_id: area.camera_id.trim(),
        label: area.label?.trim() || undefined,
      }))
      .filter((area) => area.area_id && area.camera_id),
    max_total: parseOptionalNumber(draft.max_total),
    min_total: parseOptionalNumber(draft.min_total),
    name: draft.name.trim(),
    object_class: draft.object_class.trim() || "person",
  };
}

function scenarioToDraft(scenario: OccupancyScenario): Draft {
  return {
    active: scenario.active,
    areas: (scenario.areas ?? []).map((area) => ({ ...area })),
    id: scenario.id,
    max_total:
      scenario.max_total === null || scenario.max_total === undefined
        ? ""
        : String(scenario.max_total),
    min_total:
      scenario.min_total === null || scenario.min_total === undefined
        ? ""
        : String(scenario.min_total),
    name: scenario.name,
    object_class: scenario.object_class || "person",
  };
}

function createEmptyDraft(): Draft {
  return {
    active: true,
    areas: [],
    max_total: "",
    min_total: "",
    name: "",
    object_class: "person",
  };
}

function thresholdSummary(scenario: OccupancyScenario) {
  const min =
    scenario.min_total === null || scenario.min_total === undefined
      ? "sem mín."
      : `mín. ${formatNumber(scenario.min_total)}`;
  const max =
    scenario.max_total === null || scenario.max_total === undefined
      ? "sem máx."
      : `máx. ${formatNumber(scenario.max_total)}`;

  return `${min} / ${max}`;
}

function areaOptionKey(cameraId: string, areaId: string) {
  return buildOccupancyAreaKey(cameraId, areaId);
}

function areaKey(area: OccupancyScenarioArea) {
  return areaOptionKey(area.camera_id, area.area_id);
}

function parseOptionalNumber(value: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return undefined;

  const parsed = Number(cleanValue);
  if (!Number.isFinite(parsed)) return undefined;

  return Math.max(0, parsed);
}
