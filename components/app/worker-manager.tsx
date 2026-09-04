"use client";

import * as React from "react";
import {
  Copy,
  Edit,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Search,
  ServerCog,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { useResourceAutoRefresh } from "@/components/app/use-resource-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiFetch } from "@/lib/api";
import { useEffectiveCompanyScopeId } from "@/lib/master-company-scope";
import { canManageWorkers } from "@/lib/permissions";
import { PROVISIONED_RESOURCE_REFRESH_INTERVAL_MS } from "@/lib/resource-auto-refresh";
import type {
  CreateWorkerResponse,
  RotateWorkerKeyResponse,
  Worker,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { getWorkerDisplayInfo } from "@/lib/worker-display";
import {
  normalizeWorkerRows,
  partitionWorkersByCompanyScope,
  resolveWorkerCompanyId,
  sortWorkersByActivity,
  workersFromExplicitCompanyScope,
  workerScopeDisplay,
  type WorkerScopeRow,
} from "@/lib/worker-scope";

type WorkerFormState = {
  name: string;
  description: string;
};

type ApiKeyNotice = {
  title: string;
  workerName: string;
  apiKey: string;
  apiKeyPrefix?: string;
};

type WorkerRow = WorkerScopeRow;

type ResourceLoadOptions = {
  silent?: boolean;
};

const emptyWorkerForm: WorkerFormState = {
  name: "",
  description: "",
};

export function WorkerManager() {
  const { user } = useAuth();
  const canEditWorkers = canManageWorkers(user);
  const [workers, setWorkers] = React.useState<Worker[]>([]);
  const [scopeWarning, setScopeWarning] = React.useState("");
  const [workerCatalogCompanyId, setWorkerCatalogCompanyId] =
    React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [deletingWorkerId, setDeletingWorkerId] = React.useState("");
  const [workerSearch, setWorkerSearch] = React.useState("");
  const [workerStatusFilter, setWorkerStatusFilter] = React.useState<
    "active" | "all" | "inactive" | "offline" | "online"
  >("all");
  const [selectedWorkerIds, setSelectedWorkerIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [workerDialog, setWorkerDialog] = React.useState(false);
  const [editingWorker, setEditingWorker] = React.useState<Worker | null>(null);
  const [workerForm, setWorkerForm] =
    React.useState<WorkerFormState>(emptyWorkerForm);
  const [keyNotice, setKeyNotice] = React.useState<ApiKeyNotice | null>(null);

  const onlineWorkers = React.useMemo(
    () => workers.filter((worker) => workerIsOnline(worker)).length,
    [workers],
  );
  const activeWorkers = workers.filter((worker) => worker.active).length;
  const selectedWorkers = React.useMemo(
    () => workers.filter((worker) => selectedWorkerIds.has(worker.id)),
    [selectedWorkerIds, workers],
  );
  const visibleWorkers = React.useMemo(() => {
    const search = normalizeWorkerSearchText(workerSearch);
    return workers.filter((worker) => {
      const online = workerIsOnline(worker);
      const matchesStatus =
        workerStatusFilter === "all" ||
        (workerStatusFilter === "active" && worker.active) ||
        (workerStatusFilter === "inactive" && !worker.active) ||
        (workerStatusFilter === "online" && online) ||
        (workerStatusFilter === "offline" && worker.active && !online);
      if (!matchesStatus) return false;
      if (!search) return true;
      const display = getWorkerDisplayInfo(worker);
      return normalizeWorkerSearchText(
        `${worker.name} ${worker.description ?? ""} ${worker.hostname ?? ""} ${display.apiKeyPrefix ?? ""}`,
      ).includes(search);
    });
  }, [workerSearch, workerStatusFilter, workers]);
  const selectedVisibleWorkerCount = visibleWorkers.filter((worker) =>
    selectedWorkerIds.has(worker.id),
  ).length;
  const allWorkersSelected =
    visibleWorkers.length > 0 &&
    selectedVisibleWorkerCount === visibleWorkers.length;
  const someWorkersSelected =
    selectedVisibleWorkerCount > 0 && !allWorkersSelected;
  const workerMutationBusy =
    saving || bulkDeleting || Boolean(deletingWorkerId);
  const effectiveCompanyId = useEffectiveCompanyScopeId(user);
  const canViewWorkers = Boolean(user && effectiveCompanyId);
  const workerCatalogCertified =
    Boolean(effectiveCompanyId) &&
    workerCatalogCompanyId === effectiveCompanyId;
  const workerExistingItemActionsDisabled =
    workerMutationBusy || !workerCatalogCertified;
  const effectiveCompanyIdRef = React.useRef(effectiveCompanyId);
  const workerMutationSequenceRef = React.useRef(0);
  const workerLoadSequenceRef = React.useRef(0);

  React.useEffect(() => {
    effectiveCompanyIdRef.current = effectiveCompanyId;
  }, [effectiveCompanyId]);

  const loadWorkers = React.useCallback(async (
    { silent = false }: ResourceLoadOptions = {},
  ) => {
    if (!canViewWorkers) {
      setWorkers([]);
      setWorkerCatalogCompanyId("");
      setScopeWarning("");
      setLoading(false);
      return;
    }
    const requestedCompanyId = effectiveCompanyId;
    const loadSequence = ++workerLoadSequenceRef.current;

    if (!silent) {
      setLoading(true);
      setScopeWarning("");
    }
    try {
      const rows = await fetchCompanyWorkers(requestedCompanyId);
      if (
        effectiveCompanyIdRef.current !== requestedCompanyId ||
        loadSequence !== workerLoadSequenceRef.current
      ) return;
      if (requestedCompanyId) {
        const { scopedRows, foreignRows, unscopedRows } =
          partitionWorkersByCompanyScope(rows, requestedCompanyId);

        const nextWorkers = sortWorkersByActivity(
          workersFromExplicitCompanyScope({
            foreignRows,
            scopedRows,
            unscopedRows,
          }),
        );
        setWorkers(nextWorkers);
        setWorkerCatalogCompanyId(requestedCompanyId);
        retainExistingWorkerSelection(nextWorkers, setSelectedWorkerIds);
        setScopeWarning("");
      } else {
        const nextWorkers = sortWorkersByActivity(rows);
        setWorkers(nextWorkers);
        setWorkerCatalogCompanyId("");
        retainExistingWorkerSelection(nextWorkers, setSelectedWorkerIds);
        setScopeWarning(
          "Selecione uma empresa para consultar seus Workers.",
        );
      }
    } catch {
      if (
        !silent &&
        effectiveCompanyIdRef.current === requestedCompanyId &&
        loadSequence === workerLoadSequenceRef.current
      ) {
        toast.error("Não foi possível carregar os Workers.");
      }
    } finally {
      if (
        !silent &&
        effectiveCompanyIdRef.current === requestedCompanyId &&
        loadSequence === workerLoadSequenceRef.current
      ) {
        setLoading(false);
      }
    }
  }, [canViewWorkers, effectiveCompanyId]);

  React.useEffect(() => {
    workerMutationSequenceRef.current += 1;
    workerLoadSequenceRef.current += 1;
    setWorkers([]);
    setWorkerCatalogCompanyId("");
    setScopeWarning("");
    setSaving(false);
    setWorkerDialog(false);
    setEditingWorker(null);
    setKeyNotice(null);
    setSelectedWorkerIds(new Set());
    setBulkDeleting(false);
    setDeletingWorkerId("");
    setWorkerSearch("");
    setWorkerStatusFilter("all");
  }, [effectiveCompanyId]);

  React.useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  useResourceAutoRefresh(
    () => loadWorkers({ silent: true }),
    {
      enabled: canViewWorkers && !loading && !bulkDeleting && !deletingWorkerId,
      intervalMs: PROVISIONED_RESOURCE_REFRESH_INTERVAL_MS,
    },
  );

  function openWorker(worker?: Worker) {
    if (!canEditWorkers) {
      toast.error("Seu usuário não pode alterar Workers.");
      return;
    }
    if (worker && !isWorkerCertifiedForMutation(worker, effectiveCompanyId)) {
      toast.error("Atualize a lista antes de alterar este Worker.");
      return;
    }

    setEditingWorker(worker ?? null);
    setWorkerForm(
      worker
        ? {
            name: worker.name,
            description: worker.description ?? "",
          }
        : emptyWorkerForm,
    );
    setWorkerDialog(true);
  }

  async function saveWorker() {
    if (!canEditWorkers) {
      toast.error("Seu usuário não pode alterar Workers.");
      return;
    }
    const name = workerForm.name.trim();
    if (!name) {
      toast.error("Nome obrigatório.");
      return;
    }
    if (!effectiveCompanyId) {
      toast.error("Selecione uma empresa antes de salvar o Worker.");
      return;
    }

    const requestedCompanyId = effectiveCompanyId;
    if (
      editingWorker &&
      !isWorkerCertifiedForMutation(editingWorker, requestedCompanyId)
    ) {
      toast.error("Atualize a lista antes de salvar este Worker.");
      return;
    }
    const mutationSequence = ++workerMutationSequenceRef.current;
    workerLoadSequenceRef.current += 1;

    setSaving(true);
    try {
      const body = {
        name,
        description: workerForm.description.trim() || undefined,
      };

      if (editingWorker) {
        await mutateWorker<Worker>(
          `/workers/${editingWorker.id}`,
          "PUT",
          body,
          requestedCompanyId,
        );
        if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
        toast.success("Worker atualizado.");
      } else {
        const created = await mutateWorker<CreateWorkerResponse>(
          "/workers",
          "POST",
          body,
          requestedCompanyId,
        );
        await ensureCreatedWorkerScope(created, requestedCompanyId);
        if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
        setKeyNotice({
          title: "Chave criada",
          workerName: created.name || name,
          apiKey: created.api_key,
          apiKeyPrefix: created.api_key_prefix,
        });
        toast.success("Worker criado.");
      }

      setWorkerDialog(false);
      await loadWorkers();
    } catch {
      if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
      toast.error("Não foi possível salvar o Worker.");
    } finally {
      if (isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) {
        setSaving(false);
      }
    }
  }

  async function removeWorker(worker: Worker) {
    if (!canEditWorkers) {
      toast.error("Seu usuário não pode excluir Workers.");
      return;
    }
    const requestedCompanyId = effectiveCompanyId;
    if (!requestedCompanyId) return;
    if (!isWorkerCertifiedForMutation(worker, requestedCompanyId)) {
      toast.error("Atualize a lista antes de excluir este Worker.");
      return;
    }
    if (!window.confirm(`Excluir o Worker "${worker.name}"?`)) return;
    const mutationSequence = ++workerMutationSequenceRef.current;
    workerLoadSequenceRef.current += 1;
    setDeletingWorkerId(worker.id);

    try {
      await apiFetch(`/workers/${worker.id}`, {
        companyScopeId: requestedCompanyId,
        method: "DELETE",
      });
      if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
      toast.success("Worker excluído.");
      setSelectedWorkerIds((current) => {
        if (!current.has(worker.id)) return current;
        const next = new Set(current);
        next.delete(worker.id);
        return next;
      });
      await loadWorkers();
    } catch {
      if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
      toast.error("Não foi possível excluir o Worker.");
    } finally {
      if (isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) {
        setDeletingWorkerId("");
      }
    }
  }

  function toggleWorkerSelection(workerId: string, selected: boolean) {
    setSelectedWorkerIds((current) => {
      const next = new Set(current);
      if (selected) next.add(workerId);
      else next.delete(workerId);
      return next;
    });
  }

  function toggleAllWorkers(selected: boolean) {
    const visibleIds = new Set(visibleWorkers.map((worker) => worker.id));
    setSelectedWorkerIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((workerId) => {
        if (selected) next.add(workerId);
        else next.delete(workerId);
      });
      return next;
    });
  }

  async function deleteSelectedWorkers() {
    if (!canEditWorkers || workerMutationBusy) return;
    const selectedTargets = workers.filter((worker) =>
      selectedWorkerIds.has(worker.id),
    );
    if (!selectedTargets.length) return;
    const requestedCompanyId = effectiveCompanyId;
    if (
      !requestedCompanyId ||
      !workerCatalogCertified ||
      selectedTargets.some(
        (worker) =>
          !isWorkerCertifiedForMutation(worker, requestedCompanyId),
      )
    ) {
      toast.error("Atualize a lista antes de excluir os Workers selecionados.");
      return;
    }
    const targets = selectedTargets;
    if (
      !window.confirm(
        `Excluir ${targets.length} Worker${targets.length === 1 ? "" : "s"} selecionado${targets.length === 1 ? "" : "s"}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    const mutationSequence = ++workerMutationSequenceRef.current;
    workerLoadSequenceRef.current += 1;
    const failedIds = new Set<string>();
    let deletedCount = 0;
    setBulkDeleting(true);

    try {
      for (const worker of targets) {
        if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
        try {
          await apiFetch(`/workers/${worker.id}`, {
            companyScopeId: requestedCompanyId,
            method: "DELETE",
          });
          deletedCount += 1;
        } catch {
          failedIds.add(worker.id);
        }
      }

      if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
      setSelectedWorkerIds(failedIds);
      if (!failedIds.size) {
        toast.success(
          `${deletedCount} Worker${deletedCount === 1 ? " excluído" : "s excluídos"}.`,
        );
      } else if (deletedCount) {
        toast.warning(
          `${deletedCount} excluído${deletedCount === 1 ? "" : "s"}; ${failedIds.size} não ${failedIds.size === 1 ? "pôde" : "puderam"} ser excluído${failedIds.size === 1 ? "" : "s"}.`,
        );
      } else {
        toast.error("Não foi possível excluir os Workers selecionados.");
      }
      await loadWorkers();
    } finally {
      if (isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) {
        setBulkDeleting(false);
      }
    }
  }

  async function rotateWorkerKey(worker: Worker) {
    if (!canEditWorkers) {
      toast.error("Seu usuário não pode renovar chaves de conexão.");
      return;
    }
    const requestedCompanyId = effectiveCompanyId;
    if (
      !requestedCompanyId ||
      !isWorkerCertifiedForMutation(worker, requestedCompanyId)
    ) {
      toast.error("Atualize a lista antes de renovar a chave deste Worker.");
      return;
    }
    if (
      !window.confirm(
        `Renovar a chave de conexão de "${worker.name}"? A chave anterior deixará de funcionar.`,
      )
    ) {
      return;
    }

    const mutationSequence = ++workerMutationSequenceRef.current;
    workerLoadSequenceRef.current += 1;

    try {
      const response = await apiFetch<RotateWorkerKeyResponse>(
        `/workers/${worker.id}/rotate-key`,
        {
          companyScopeId: requestedCompanyId,
          method: "POST",
        },
      );
      if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
      setKeyNotice({
        title: "Chave renovada",
        workerName: worker.name,
        apiKey: response.api_key,
        apiKeyPrefix: response.api_key_prefix,
      });
      toast.success("Chave renovada.");
      await loadWorkers();
    } catch {
      if (!isCurrentWorkerMutation(mutationSequence, requestedCompanyId)) return;
      toast.error("Não foi possível renovar a chave de conexão.");
    }
  }

  function isCurrentWorkerMutation(
    mutationSequence: number,
    companyId: string,
  ) {
    return (
      mutationSequence === workerMutationSequenceRef.current &&
      effectiveCompanyIdRef.current === companyId
    );
  }

  function isWorkerCertifiedForMutation(
    worker: Worker,
    requestedCompanyId: string,
  ) {
    if (
      !workerCatalogCertified ||
      workerCatalogCompanyId !== requestedCompanyId ||
      !workers.some((candidate) => candidate.id === worker.id)
    ) {
      return false;
    }

    const explicitCompanyId = resolveWorkerCompanyId(worker);
    return !explicitCompanyId || explicitCompanyId === requestedCompanyId;
  }

  if (!canViewWorkers) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workers</CardTitle>
          <CardDescription>
            Não foi possível identificar a empresa vinculada ao usuário.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Workers"
          value={formatNumber(workers.length)}
          detail="Registrados na empresa"
        />
        <MetricCard
          label="Ativos"
          value={formatNumber(activeWorkers)}
          detail="Disponíveis para operação"
        />
        <MetricCard
          label="Com comunicação"
          value={formatNumber(onlineWorkers)}
          detail="Últimos 5 minutos"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="h-4 w-4 text-primary" />
              Workers da empresa
            </CardTitle>
            <CardDescription>
              {canEditWorkers
                ? "Cadastre Workers e acompanhe a comunicação mais recente."
                : "Acompanhe os Workers e a comunicação mais recente."}
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => void loadWorkers()}
              disabled={loading || workerMutationBusy}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => openWorker()}
              disabled={!canEditWorkers || workerMutationBusy}
            >
              <Plus className="h-4 w-4" />
              Novo Worker
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {scopeWarning ? (
            <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {scopeWarning}
            </div>
          ) : null}
          {!loading && workers.length ? (
            <div className="grid min-w-0 gap-2 rounded-lg border bg-muted/20 p-2 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={workerSearch}
                  onChange={(event) => setWorkerSearch(event.target.value)}
                  className="h-9 pl-9"
                  placeholder="Buscar Worker"
                  aria-label="Buscar Worker"
                />
              </div>
              <Select
                value={workerStatusFilter}
                onValueChange={(value) =>
                  setWorkerStatusFilter(
                    value as typeof workerStatusFilter,
                  )
                }
              >
                <SelectTrigger className="h-9" aria-label="Filtrar Workers por status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="online">Comunicando</SelectItem>
                  <SelectItem value="offline">Sem comunicação</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                disabled={!workerSearch && workerStatusFilter === "all"}
                onClick={() => {
                  setWorkerSearch("");
                  setWorkerStatusFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
              <div className="text-xs text-muted-foreground md:col-span-3">
                {visibleWorkers.length} de {workers.length} Workers exibidos
              </div>
            </div>
          ) : null}
          {canEditWorkers && selectedWorkers.length ? (
            <div
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              role="toolbar"
              aria-label="Ações para Workers selecionados"
            >
              <div className="text-sm font-medium">
                {selectedWorkers.length} selecionado
                {selectedWorkers.length === 1 ? "" : "s"}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    selectedWorkers.length !== 1 ||
                    workerExistingItemActionsDisabled
                  }
                  onClick={() => openWorker(selectedWorkers[0])}
                >
                  <Edit className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={workerExistingItemActionsDisabled}
                  onClick={() => void deleteSelectedWorkers()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {bulkDeleting ? "Excluindo..." : "Excluir selecionados"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={workerMutationBusy}
                  onClick={() => setSelectedWorkerIds(new Set())}
                >
                  Limpar seleção
                </Button>
              </div>
            </div>
          ) : null}
          {loading ? (
            <TableSkeleton />
          ) : workers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {canEditWorkers ? (
                    <TableHead className="w-10 px-3">
                      <Checkbox
                        checked={
                          allWorkersSelected
                            ? true
                            : someWorkersSelected
                              ? "indeterminate"
                              : false
                        }
                        disabled={workerExistingItemActionsDisabled}
                        onCheckedChange={(checked) =>
                          toggleAllWorkers(checked === true)
                        }
                        aria-label="Selecionar todos os Workers"
                      />
                    </TableHead>
                  ) : null}
                  <TableHead>Worker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última comunicação</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleWorkers.map((worker) => {
                  const display = getWorkerDisplayInfo(worker);

                  return (
                    <TableRow
                      key={worker.id}
                      data-state={
                        selectedWorkerIds.has(worker.id)
                          ? "selected"
                          : undefined
                      }
                    >
                      {canEditWorkers ? (
                        <TableCell className="w-10 px-3">
                          <Checkbox
                            checked={selectedWorkerIds.has(worker.id)}
                            disabled={workerExistingItemActionsDisabled}
                            onCheckedChange={(checked) =>
                              toggleWorkerSelection(worker.id, checked === true)
                            }
                            aria-label={`Selecionar Worker ${worker.name}`}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <div className="font-medium">{worker.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {worker.description || "Sem descrição"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <WorkerStatusBadge worker={worker} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(display.lastSeenAt)}
                      </TableCell>
                      <TableCell>
                        <WorkerScopeBadge
                          worker={worker as WorkerRow}
                          companyId={effectiveCompanyId}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {display.apiKeyPrefix ? "Configurada" : "Não informada"}
                      </TableCell>
                      <TableCell>
                        {canEditWorkers ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openWorker(worker)}
                              disabled={workerExistingItemActionsDisabled}
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => rotateWorkerKey(worker)}
                              disabled={workerExistingItemActionsDisabled}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Chave
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeWorker(worker)}
                              disabled={workerExistingItemActionsDisabled}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Excluir
                            </Button>
                          </div>
                        ) : (
                          <div className="text-right text-xs text-muted-foreground">
                            Somente leitura
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!visibleWorkers.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={canEditWorkers ? 7 : 6}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      Nenhum Worker corresponde aos filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          ) : (
            <EmptyState text="Nenhum Worker cadastrado para esta empresa." />
          )}
        </CardContent>
      </Card>

      <Dialog open={workerDialog} onOpenChange={setWorkerDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? "Editar Worker" : "Novo Worker"}
            </DialogTitle>
            <DialogDescription>
              Identifique o equipamento responsável por coletar e transmitir os dados.
            </DialogDescription>
          </DialogHeader>

          <FormField label="Nome">
            <Input
              value={workerForm.name}
              onChange={(event) =>
                setWorkerForm((form) => ({ ...form, name: event.target.value }))
              }
              placeholder="Ex.: Entrada principal"
            />
          </FormField>
          <FormField label="Descrição">
            <Textarea
              value={workerForm.description}
              onChange={(event) =>
                setWorkerForm((form) => ({
                  ...form,
                  description: event.target.value,
                }))
              }
              placeholder="Ex.: Worker de contagem da entrada"
            />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setWorkerDialog(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={saveWorker} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApiKeyDialog notice={keyNotice} onOpenChange={setKeyNotice} />
    </section>
  );
}

function retainExistingWorkerSelection(
  workers: Worker[],
  setSelection: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  const availableIds = new Set(workers.map((worker) => worker.id));
  setSelection((current) => {
    const retained = new Set(
      [...current].filter((workerId) => availableIds.has(workerId)),
    );
    if (
      retained.size === current.size &&
      [...retained].every((workerId) => current.has(workerId))
    ) {
      return current;
    }
    return retained;
  });
}

function normalizeWorkerSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function WorkerStatusBadge({ worker }: { worker: Worker }) {
  if (!worker.active) {
    return <Badge variant="secondary">Inativo</Badge>;
  }

  if (workerIsOnline(worker)) {
    return <Badge variant="success">Comunicando</Badge>;
  }

  return <Badge variant="warning">Sem comunicação</Badge>;
}

function WorkerScopeBadge({
  worker,
  companyId,
}: {
  worker: WorkerRow;
  companyId?: string | null;
}) {
  const scope = workerScopeDisplay(worker, companyId);

  return (
    <div className="space-y-1">
      <Badge variant={scope.variant}>
        {scope.label === "Vinculado"
          ? "Vínculo confirmado"
          : scope.label === "Outra empresa"
            ? "Vínculo divergente"
            : "Vínculo pendente"}
      </Badge>
    </div>
  );
}

async function fetchCompanyWorkers(companyScopeId: string) {
  return apiFetch<unknown>("/workers", { companyScopeId }).then(
    normalizeWorkerRows,
  );
}

async function mutateWorker<T>(
  path: string,
  method: "POST" | "PUT",
  body: { name: string; description?: string },
  companyScopeId: string,
) {
  return apiFetch<T>(path, { body, companyScopeId, method });
}

async function ensureCreatedWorkerScope(worker: CreateWorkerResponse, companyId: string) {
  const workerCompanyId = resolveWorkerCompanyId(worker);
  if (workerCompanyId && workerCompanyId !== companyId) {
    throw new Error(
      "O Worker não pôde ser vinculado à empresa selecionada.",
    );
  }

  if (workerCompanyId === companyId) {
    return;
  }

  const rows = await fetchCompanyWorkers(companyId).catch(() => []);
  const { scopedRows, foreignRows, unscopedRows } =
    partitionWorkersByCompanyScope(rows, companyId);
  const workerId = worker.id?.trim();
  const apiKeyPrefix = worker.api_key_prefix?.trim();
  const matchesWorker = (row: WorkerRow) =>
    Boolean(
      (workerId && row.id === workerId) ||
        (apiKeyPrefix &&
          getWorkerDisplayInfo(row).apiKeyPrefix === apiKeyPrefix),
    );

  const scopedWorker = scopedRows.find(matchesWorker);
  if (scopedWorker) return;

  const foreignWorker = foreignRows.find(matchesWorker);
  if (foreignWorker) {
    throw new Error(
      "O Worker foi associado a outra empresa e não pode ser usado neste contexto.",
    );
  }

  if (unscopedRows.some(matchesWorker) && !foreignRows.length) {
    return;
  }

  if (unscopedRows.some(matchesWorker)) {
    throw new Error(
      "Não foi possível confirmar a empresa responsável por este Worker.",
    );
  }

  throw new Error(
    "Não foi possível confirmar o novo Worker nesta empresa. A chave de conexão não foi exibida por segurança.",
  );
}

function workerIsOnline(worker: Worker) {
  const lastSeenAt = getWorkerDisplayInfo(worker).lastSeenAt;
  if (!worker.active || !lastSeenAt) return false;

  const lastSeen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(lastSeen)) return false;

  return Date.now() - lastSeen <= 5 * 60_000;
}

function ApiKeyDialog({
  notice,
  onOpenChange,
}: {
  notice: ApiKeyNotice | null;
  onOpenChange: (notice: ApiKeyNotice | null) => void;
}) {
  async function copyKey() {
    if (!notice?.apiKey) return;

    try {
      await navigator.clipboard.writeText(notice.apiKey);
      toast.success("Chave copiada.");
    } catch {
      toast.error("Não foi possível copiar a chave.");
    }
  }

  return (
    <Dialog open={Boolean(notice)} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            {notice?.title ?? "Chave de conexão"}
          </DialogTitle>
          <DialogDescription>
            Guarde esta chave agora. Por segurança, ela não será exibida novamente.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-primary/20 bg-primary/10 p-3">
          <div className="text-sm font-medium">{notice?.workerName}</div>
          <div className="mt-3 break-all rounded-md border bg-card p-3 font-mono text-xs">
            {notice?.apiKey}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(null)}>
            Fechar
          </Button>
          <Button type="button" onClick={copyKey}>
            <Copy className="h-4 w-4" />
            Copiar chave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
