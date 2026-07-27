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
import { requireOccupancyScenarioRows } from "@/lib/occupancy-validation";
import { canManageOccupancy, canManageScenarios } from "@/lib/permissions";
import type {
  OccupancyScenario,
  OccupancyScenarioArea,
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
  const [loadingAreas, setLoadingAreas] = React.useState(true);
  const [scenarioCatalogError, setScenarioCatalogError] = React.useState("");
  const [areaCatalogError, setAreaCatalogError] = React.useState("");
  const [scenarioCatalogReady, setScenarioCatalogReady] = React.useState(false);
  const [areaCatalogReady, setAreaCatalogReady] = React.useState(false);
  const [scenarioCatalogCompanyId, setScenarioCatalogCompanyId] =
    React.useState("");
  const [areaCatalogCompanyId, setAreaCatalogCompanyId] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingScenario, setEditingScenario] =
    React.useState<OccupancyScenario | null>(null);
  const scenarioRequestSequenceRef = React.useRef(0);
  const areaRequestSequenceRef = React.useRef(0);
  const companyScopeIdRef = React.useRef(companyScopeId);
  const scenarioCatalogCertified =
    Boolean(companyScopeId) &&
    scenarioCatalogReady &&
    scenarioCatalogCompanyId === companyScopeId;
  const areaCatalogCertified =
    Boolean(companyScopeId) &&
    areaCatalogReady &&
    areaCatalogCompanyId === companyScopeId;
  const catalogsReady =
    scenarioCatalogCertified && areaCatalogCertified;

  const loadScenarios = React.useCallback(async () => {
    const requestSequence = ++scenarioRequestSequenceRef.current;
    setLoading(true);
    setScenarioCatalogReady(false);
    setScenarioCatalogCompanyId("");
    setScenarioCatalogError("");
    try {
      if (!companyScopeId) {
        throw new Error(
          "Empresa ativa não definida para carregar cenários de ocupação.",
        );
      }
      const response = await apiFetch<unknown>("/occupancy/scenarios");
      const rows = filterScopedApiRows(
        requireOccupancyScenarioRows(response),
        companyScopeId,
      );
      if (requestSequence !== scenarioRequestSequenceRef.current) return;
      setScenarios(rows);
      setScenarioCatalogCompanyId(companyScopeId);
      setScenarioCatalogReady(true);
    } catch (error) {
      if (requestSequence !== scenarioRequestSequenceRef.current) return;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar cenários de ocupação.";
      setScenarios([]);
      setScenarioCatalogCompanyId("");
      setScenarioCatalogError(message);
      setScenarioCatalogReady(false);
      toast.error(message);
    } finally {
      if (requestSequence === scenarioRequestSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [companyScopeId]);

  const loadAreaOptions = React.useCallback(async () => {
    const requestSequence = ++areaRequestSequenceRef.current;
    const now = new Date();
    setLoadingAreas(true);
    setAreaOptions([]);
    setAreaCatalogReady(false);
    setAreaCatalogCompanyId("");
    setAreaCatalogError("");
    try {
      if (!companyScopeId) {
        throw new Error(
          "Empresa ativa não definida para descobrir áreas de ocupação.",
        );
      }
      const options = await fetchOccupancyAreaOptions({
        companyId: companyScopeId,
        from: new Date(now.getTime() - 4 * HOUR_MS),
        to: now,
      });
      if (requestSequence !== areaRequestSequenceRef.current) return;
      setAreaOptions(options);
      setAreaCatalogCompanyId(companyScopeId);
      setAreaCatalogReady(true);
    } catch (error) {
      if (requestSequence !== areaRequestSequenceRef.current) return;
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível certificar o catálogo de áreas de ocupação.";
      setAreaOptions([]);
      setAreaCatalogCompanyId("");
      setAreaCatalogError(message);
      setAreaCatalogReady(false);
      toast.error(message);
    } finally {
      if (requestSequence === areaRequestSequenceRef.current) {
        setLoadingAreas(false);
      }
    }
  }, [companyScopeId]);

  React.useEffect(() => {
    companyScopeIdRef.current = companyScopeId;
  }, [companyScopeId]);

  React.useEffect(() => {
    setDialogOpen(false);
    setEditingScenario(null);
    void loadScenarios();
    void loadAreaOptions();
  }, [loadAreaOptions, loadScenarios]);

  function openCreateDialog() {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }
    if (!catalogsReady) {
      toast.error(
        areaCatalogError ||
          scenarioCatalogError ||
          "Os catálogos de ocupação ainda não foram certificados.",
      );
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
    if (!catalogsReady) {
      toast.error(
        areaCatalogError ||
          scenarioCatalogError ||
          "Os catálogos de ocupação ainda não foram certificados.",
      );
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
    if (!scenarioCatalogCertified) {
      toast.error(
        scenarioCatalogError ||
          "O catálogo de cenários de ocupação não está certificado.",
      );
      return;
    }
    if (scenario.company_id !== companyScopeId) {
      toast.error(
        `O cenário pertence à empresa "${scenario.company_id}", não à empresa ativa "${companyScopeId}".`,
      );
      return;
    }

    if (!window.confirm(`Excluir o cenário de ocupação "${scenario.name}"?`)) {
      return;
    }

    const requestedCompanyId = companyScopeId;
    try {
      await apiFetch(`/occupancy/scenarios/${scenario.id}`, { method: "DELETE" });
      requireUnchangedCompanyScope(
        requestedCompanyId,
        companyScopeIdRef.current,
      );
      toast.success("Cenário de ocupação excluído.");
      await loadScenarios();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  async function handleSaved(savedCompanyId: string) {
    if (savedCompanyId !== companyScopeIdRef.current) return;
    setDialogOpen(false);
    await Promise.all([loadScenarios(), loadAreaOptions()]);
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
                void loadScenarios();
                void loadAreaOptions();
              }}
              disabled={loading || loadingAreas}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (loading || loadingAreas) && "animate-spin",
                )}
              />
              Atualizar
            </Button>
            {canEdit ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={openCreateDialog}
                disabled={!catalogsReady}
              >
                <Plus className="h-4 w-4" />
                Novo cenário
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {areaCatalogError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Catálogo de áreas bloqueado: {areaCatalogError}
            </div>
          ) : loadingAreas ? (
            <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Certificando câmeras, workers, linhas e snapshots de ocupação...
            </div>
          ) : null}
          {loading ? (
            <TableSkeleton />
          ) : scenarioCatalogError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
              Catálogo de cenários bloqueado: {scenarioCatalogError}
            </div>
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
                            disabled={!catalogsReady}
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteScenario(scenario)}
                            disabled={!scenarioCatalogCertified}
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
                  <Button
                    type="button"
                    onClick={openCreateDialog}
                    disabled={!catalogsReady}
                  >
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
        areaCatalogError={areaCatalogError}
        areaCatalogReady={areaCatalogCertified}
        areaOptions={areaOptions}
        companyId={companyScopeId}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        open={dialogOpen}
        scenario={editingScenario}
      />
    </section>
  );
}

function OccupancyScenarioDialog({
  areaCatalogError,
  areaCatalogReady,
  areaOptions,
  companyId,
  onOpenChange,
  onSaved,
  open,
  scenario,
}: {
  areaCatalogError: string;
  areaCatalogReady: boolean;
  areaOptions: AreaOption[];
  companyId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (companyId: string) => Promise<void>;
  open: boolean;
  scenario: OccupancyScenario | null;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => createEmptyDraft());
  const [saving, setSaving] = React.useState(false);
  const companyIdRef = React.useRef(companyId);

  React.useEffect(() => {
    companyIdRef.current = companyId;
  }, [companyId]);

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
    if (!areaCatalogReady || !companyId) {
      toast.error(
        areaCatalogError ||
          "O catálogo de áreas não está certificado para salvar o cenário.",
      );
      return;
    }

    let payload: ReturnType<typeof buildScenarioPayload>;
    try {
      payload = buildScenarioPayload(draft);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "A configuração do cenário é inválida.",
      );
      return;
    }

    setSaving(true);
    try {
      if (draft.id) {
        const response = await apiFetch<unknown>(
          `/occupancy/scenarios/${draft.id}`,
          {
            method: "PUT",
            body: {
              ...payload,
              active: draft.active,
            },
          },
        );
        requireUnchangedCompanyScope(companyId, companyIdRef.current);
        requireSavedScenario(response, {
          active: draft.active,
          companyId,
          expectedId: draft.id,
          payload,
        });
        toast.success("Cenário de ocupação atualizado.");
      } else {
        const response = await apiFetch<unknown>("/occupancy/scenarios", {
          method: "POST",
          body: payload,
        });
        requireUnchangedCompanyScope(companyId, companyIdRef.current);
        requireSavedScenario(response, { companyId, payload });
        toast.success("Cenário de ocupação criado.");
      }

      await onSaved(companyId);
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
          {!areaCatalogReady ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Salvamento bloqueado:{" "}
              {areaCatalogError ||
                "o catálogo de áreas ainda não foi certificado."}
            </div>
          ) : null}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addArea}
                disabled={!areaCatalogReady}
              >
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
          <Button
            type="button"
            onClick={saveScenario}
            disabled={saving || !areaCatalogReady}
          >
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

function buildScenarioPayload(draft: Draft) {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Informe o nome do cenário.");
  }
  const objectClass = draft.object_class.trim();
  if (!objectClass) {
    throw new Error("Informe a classe de objeto.");
  }
  if (!draft.areas.length) {
    throw new Error("Inclua pelo menos uma área.");
  }

  const identities = new Set<string>();
  const areas = draft.areas.map((area, index) => {
    const areaId = area.area_id.trim();
    const cameraId = area.camera_id.trim();
    if (!cameraId || !areaId) {
      throw new Error(
        `Preencha camera_id e area_id da área na posição ${index + 1}.`,
      );
    }
    const identity = areaOptionKey(cameraId, areaId);
    if (identities.has(identity)) {
      throw new Error(
        `A área "${areaId}" da câmera "${cameraId}" está duplicada.`,
      );
    }
    identities.add(identity);

    return {
      area_id: areaId,
      camera_id: cameraId,
      label: area.label?.trim() || undefined,
    };
  });
  const minimum = parseOptionalNumber(draft.min_total, "mínimo");
  const maximum = parseOptionalNumber(draft.max_total, "máximo");
  if (
    minimum !== undefined &&
    maximum !== undefined &&
    minimum > maximum
  ) {
    throw new Error("O mínimo não pode ser maior que o máximo.");
  }

  return {
    areas,
    max_total: maximum,
    min_total: minimum,
    name,
    object_class: objectClass,
  };
}

function requireUnchangedCompanyScope(
  requestedCompanyId: string,
  currentCompanyId: string,
) {
  if (requestedCompanyId !== currentCompanyId) {
    throw new Error(
      "A empresa ativa mudou durante o salvamento; a resposta foi descartada.",
    );
  }
}

function requireSavedScenario(
  value: unknown,
  {
    active,
    companyId,
    expectedId,
    payload,
  }: {
    active?: boolean;
    companyId: string;
    expectedId?: string;
    payload: ReturnType<typeof buildScenarioPayload>;
  },
) {
  const [scenario] = requireOccupancyScenarioRows([value]);
  if (scenario.company_id !== companyId) {
    throw new Error(
      `A API salvou o cenário na empresa "${scenario.company_id}", não na empresa ativa "${companyId}".`,
    );
  }
  if (expectedId && scenario.id !== expectedId) {
    throw new Error(
      `A API retornou o cenário "${scenario.id}" ao atualizar "${expectedId}".`,
    );
  }
  if (
    scenario.name !== payload.name ||
    scenario.object_class !== payload.object_class ||
    (scenario.min_total ?? undefined) !== payload.min_total ||
    (scenario.max_total ?? undefined) !== payload.max_total ||
    (active !== undefined && scenario.active !== active)
  ) {
    throw new Error(
      "A API retornou um cenário diferente da configuração salva.",
    );
  }

  const savedAreas = new Map(
    scenario.areas.map((area) => [areaKey(area), area] as const),
  );
  if (savedAreas.size !== payload.areas.length) {
    throw new Error(
      "A API retornou uma quantidade de áreas diferente da configuração salva.",
    );
  }
  payload.areas.forEach((area) => {
    const saved = savedAreas.get(areaOptionKey(area.camera_id, area.area_id));
    if (!saved || (saved.label ?? undefined) !== area.label) {
      throw new Error(
        `A API não confirmou a área "${area.area_id}" da câmera "${area.camera_id}".`,
      );
    }
  });

  return scenario;
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

function parseOptionalNumber(value: string, label: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return undefined;

  const parsed = Number(cleanValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Informe um valor ${label} não negativo válido.`);
  }

  return parsed;
}
