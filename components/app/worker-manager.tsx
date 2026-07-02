"use client";

import * as React from "react";
import {
  Copy,
  Edit,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
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
import { ApiError, apiFetch } from "@/lib/api";
import {
  useEffectiveCompanyScopeId,
  withCompanyScope,
} from "@/lib/master-company-scope";
import { canManageWorkers } from "@/lib/permissions";
import type {
  CreateWorkerResponse,
  RotateWorkerKeyResponse,
  Worker,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { getWorkerDisplayInfo } from "@/lib/worker-display";
import {
  annotateWorkerCompanyScope,
  normalizeWorkerRows,
  partitionWorkersByCompanyScope,
  resolveWorkerCompanyId,
  sortWorkersByActivity,
  withWorkerClientScope,
  withWorkerCompanyScope,
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

const emptyWorkerForm: WorkerFormState = {
  name: "",
  description: "",
};

export function WorkerManager() {
  const { user } = useAuth();
  const canEditWorkers = canManageWorkers(user);
  const [workers, setWorkers] = React.useState<Worker[]>([]);
  const [scopeWarning, setScopeWarning] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
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
  const effectiveCompanyId = useEffectiveCompanyScopeId(user);
  const canViewWorkers = Boolean(user && effectiveCompanyId);

  const loadWorkers = React.useCallback(async () => {
    if (!canViewWorkers) {
      setWorkers([]);
      setScopeWarning("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setScopeWarning("");
    try {
      const rows = await fetchCompanyWorkers(effectiveCompanyId);
      if (effectiveCompanyId) {
        const { scopedRows, foreignRows, inferredRows, unscopedRows } =
          partitionWorkersByCompanyScope(rows, effectiveCompanyId);

        setWorkers(sortWorkersByActivity(scopedRows));
        setScopeWarning(
          buildWorkerScopeWarning(
            foreignRows.length,
            unscopedRows.length,
            inferredRows.length,
          ),
        );
      } else {
        setWorkers(sortWorkersByActivity(rows));
        setScopeWarning(
          "Nenhuma empresa ativa foi definida para escopar os workers.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar workers.",
      );
    } finally {
      setLoading(false);
    }
  }, [canViewWorkers, effectiveCompanyId]);

  React.useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  function openWorker(worker?: Worker) {
    if (!canEditWorkers) {
      toast.error("Seu usuário não pode alterar workers.");
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
    const name = workerForm.name.trim();
    if (!name) {
      toast.error("Nome obrigatório.");
      return;
    }
    if (!effectiveCompanyId) {
      toast.error("Selecione uma empresa antes de salvar workers.");
      return;
    }

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
          effectiveCompanyId,
        );
        toast.success("Worker atualizado.");
      } else {
        const created = await mutateWorker<CreateWorkerResponse>(
          "/workers",
          "POST",
          body,
          effectiveCompanyId,
        );
        await ensureCreatedWorkerScope(created, effectiveCompanyId);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar worker.");
    } finally {
      setSaving(false);
    }
  }

  async function removeWorker(worker: Worker) {
    if (!window.confirm(`Excluir o worker "${worker.name}"?`)) return;

    try {
      await apiFetch(`/workers/${worker.id}`, {
        method: "DELETE",
        headers: companyScopeHeaders(effectiveCompanyId),
      });
      toast.success("Worker excluído.");
      await loadWorkers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir worker.");
    }
  }

  async function rotateWorkerKey(worker: Worker) {
    if (
      !window.confirm(
        `Rotacionar a chave do worker "${worker.name}"? A chave anterior deixará de funcionar.`,
      )
    ) {
      return;
    }

    try {
      const response = await apiFetch<RotateWorkerKeyResponse>(
        `/workers/${worker.id}/rotate-key`,
        {
          method: "POST",
          headers: companyScopeHeaders(effectiveCompanyId),
        },
      );
      setKeyNotice({
        title: "Chave rotacionada",
        workerName: worker.name,
        apiKey: response.api_key,
        apiKeyPrefix: response.api_key_prefix,
      });
      toast.success("Chave rotacionada.");
      await loadWorkers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao rotacionar chave.",
      );
    }
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
          detail="Liberados no backend"
        />
        <MetricCard
          label="Com heartbeat"
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
                ? "Cadastre workers de borda e acompanhe o último heartbeat."
                : "Acompanhe os workers de borda e o último heartbeat."}
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={loadWorkers}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => openWorker()}
              disabled={!canEditWorkers}
            >
              <Plus className="h-4 w-4" />
              Novo worker
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {scopeWarning ? (
            <div className="rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {scopeWarning}
            </div>
          ) : null}
          {loading ? (
            <TableSkeleton />
          ) : workers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último heartbeat</TableHead>
                  <TableHead>Ambiente</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => {
                  const display = getWorkerDisplayInfo(worker);

                  return (
                    <TableRow key={worker.id}>
                      <TableCell>
                        <div className="font-medium">{worker.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {worker.description || display.identifier || worker.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <WorkerStatusBadge worker={worker} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(display.lastSeenAt)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {display.environment || "-"}
                        </div>
                        {display.version ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {display.version}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <WorkerScopeBadge
                          worker={worker as WorkerRow}
                          companyId={effectiveCompanyId}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {display.apiKeyPrefix || "-"}
                      </TableCell>
                      <TableCell>
                        {canEditWorkers ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openWorker(worker)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => rotateWorkerKey(worker)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Chave
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeWorker(worker)}
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
              </TableBody>
            </Table>
          ) : (
            <EmptyState text="Nenhum worker cadastrado para esta empresa." />
          )}
        </CardContent>
      </Card>

      <Dialog open={workerDialog} onOpenChange={setWorkerDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? "Editar worker" : "Novo worker"}
            </DialogTitle>
            <DialogDescription>
              O worker usa a API key para buscar configuração e enviar eventos.
            </DialogDescription>
          </DialogHeader>

          <FormField label="Nome">
            <Input
              value={workerForm.name}
              onChange={(event) =>
                setWorkerForm((form) => ({ ...form, name: event.target.value }))
              }
              placeholder="Worker Entrada"
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
              placeholder="Worker de contagem"
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

function WorkerStatusBadge({ worker }: { worker: Worker }) {
  if (!worker.active) {
    return <Badge variant="secondary">Inativo</Badge>;
  }

  if (workerIsOnline(worker)) {
    return <Badge variant="success">Online</Badge>;
  }

  return <Badge variant="warning">Sem heartbeat</Badge>;
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
      <Badge variant={scope.variant}>{scope.label}</Badge>
      {scope.detail ? (
        <div className="max-w-[180px] truncate font-mono text-[11px] text-muted-foreground">
          {scope.detail}
        </div>
      ) : null}
    </div>
  );
}

function companyScopeHeaders(companyId?: string | null) {
  const cleanCompanyId = companyId?.trim();
  return cleanCompanyId ? { "X-Company-ID": cleanCompanyId } : undefined;
}

async function fetchCompanyWorkers(companyId?: string | null) {
  const headers = companyScopeHeaders(companyId);
  return apiFetch<unknown>("/workers", { headers }).then(
    (response) =>
      normalizeWorkerRows(response).map((row) =>
        annotateWorkerCompanyScope(row, companyId, "GET /workers"),
      ),
  );
}

async function mutateWorker<T>(
  path: string,
  method: "POST" | "PUT",
  body: { name: string; description?: string },
  companyId: string,
) {
  const headers = companyScopeHeaders(companyId);
  const attempts = [
    withWorkerCompanyScope(body, companyId),
    withCompanyScope(body, companyId),
    withWorkerClientScope(body, companyId),
    body,
  ];
  let lastError: unknown;

  for (const attemptBody of attempts) {
    try {
      return await apiFetch<T>(withWorkerScopeQuery(path, companyId), {
        method,
        headers,
        body: attemptBody,
      });
    } catch (error) {
      lastError = error;
      if (!isWorkerPayloadShapeError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao salvar worker.");
}

function isWorkerPayloadShapeError(error: unknown) {
  return error instanceof ApiError && (error.status === 400 || error.status === 422);
}

async function ensureCreatedWorkerScope(worker: CreateWorkerResponse, companyId: string) {
  const workerCompanyId = resolveWorkerCompanyId(worker);
  if (workerCompanyId && workerCompanyId !== companyId) {
    throw new Error(
      `A API criou o worker vinculado a outra empresa (${workerCompanyId}), não à empresa ativa (${companyId}).`,
    );
  }

  if (workerCompanyId === companyId) {
    return;
  }

  const rows = await fetchCompanyWorkers(companyId).catch(() => []);
  const { scopedRows, foreignRows } = partitionWorkersByCompanyScope(rows, companyId);
  const workerId = worker.id?.trim();
  const apiKeyPrefix = worker.api_key_prefix?.trim();
  const matchesWorker = (row: WorkerRow) =>
    Boolean(
      (workerId && row.id === workerId) ||
        (apiKeyPrefix &&
          getWorkerDisplayInfo(row).apiKeyPrefix === apiKeyPrefix),
    );

  const scopedWorker = scopedRows.find(matchesWorker);
  if (scopedWorker) {
    toast.warning(
      "Worker criado, mas a API não retornou company_id/client_id no cadastro; o vínculo foi confirmado pela consulta escopada.",
    );
    return;
  }

  const foreignWorker = foreignRows.find(matchesWorker);
  if (foreignWorker) {
    throw new Error(
      `A API retornou o worker criado em outra empresa (${resolveWorkerCompanyId(foreignWorker) || "sem company_id"}).`,
    );
  }

  throw new Error(
    "A API criou o worker, mas ele não foi retornado para a empresa ativa. A chave não foi exibida para evitar registrar o worker na empresa errada.",
  );
}

function withWorkerScopeQuery(path: string, companyId: string) {
  const [pathname, hashFragment = ""] = path.split("#", 2);
  const [basePath, queryString = ""] = pathname.split("?", 2);
  const params = new URLSearchParams(queryString);
  if (!params.has("company_id")) params.set("company_id", companyId);

  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}${hashFragment ? `#${hashFragment}` : ""}`;
}

function buildWorkerScopeWarning(
  foreignCount: number,
  unscopedCount: number,
  inferredCount: number,
) {
  const messages = [];
  if (foreignCount) {
    messages.push(
      `${formatNumber(foreignCount)} worker(s) de outras empresas foram ocultados.`,
    );
  }
  if (inferredCount) {
    messages.push(
      `${formatNumber(inferredCount)} worker(s) tiveram o vínculo inferido pela consulta da empresa, porque a API não retornou company_id/client_id no corpo.`,
    );
  }
  if (unscopedCount) {
    messages.push(
      `${formatNumber(unscopedCount)} worker(s) vieram sem company_id/client_id; foram exibidos por terem sido retornados pela consulta escopada, mas o backend precisa persistir esse vínculo.`,
    );
  }

  return messages.join(" ");
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
            {notice?.title ?? "Chave do worker"}
          </DialogTitle>
          <DialogDescription>
            Salve esta chave agora. O backend não mostra a API key completa depois.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-primary/20 bg-primary/10 p-3">
          <div className="text-sm font-medium">{notice?.workerName}</div>
          {notice?.apiKeyPrefix ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Prefixo: {notice.apiKeyPrefix}
            </div>
          ) : null}
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
