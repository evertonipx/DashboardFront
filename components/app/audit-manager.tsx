"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  ScrollText,
} from "lucide-react";

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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  auditListPath,
  normalizePaginatedAuditResponse,
  summarizeAuditBusinessData,
  type AuditBusinessPresentation,
  type AuditLogEntry,
  type PaginatedAuditResponse,
} from "@/lib/audit";
import { ApiError, apiFetch } from "@/lib/api";
import {
  usesMasterCrossCompanyScope,
  useEffectiveCompanyScopeId,
  useEffectiveCompanyTimeZone,
} from "@/lib/master-company-scope";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

const AUDIT_PAGE_SIZES = [25, 50, 100, 200] as const;

type AuditPageEnvelope = {
  companyId: string;
  limit: number;
  page: number;
  response: PaginatedAuditResponse;
};

export function AuditManager() {
  const { user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user).trim();
  const companyTimeZone = useEffectiveCompanyTimeZone(user);
  const masterCrossCompanyScope = usesMasterCrossCompanyScope(
    user,
    companyScopeId,
  );
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(50);
  const [paginationCompanyId, setPaginationCompanyId] =
    React.useState(companyScopeId);
  const [reloadRevision, setReloadRevision] = React.useState(0);
  const [pageEnvelope, setPageEnvelope] =
    React.useState<AuditPageEnvelope | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const listRequestSequenceRef = React.useRef(0);

  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<AuditLogEntry | null>(null);

  const currentResponse =
    pageEnvelope?.companyId === companyScopeId &&
    pageEnvelope.page === page &&
    pageEnvelope.limit === limit
      ? pageEnvelope.response
      : null;
  const totalPages = currentResponse
    ? Math.max(1, Math.ceil(currentResponse.total / currentResponse.limit))
    : 1;
  const firstVisible = currentResponse?.total
    ? (currentResponse.page - 1) * currentResponse.limit + 1
    : 0;
  const lastVisible = currentResponse
    ? Math.min(
        currentResponse.total,
        firstVisible + currentResponse.data.length - 1,
      )
    : 0;
  const presentedEntries = React.useMemo(
    () =>
      (currentResponse?.data ?? []).map((entry) => ({
        business: summarizeAuditBusinessData(entry.data),
        entry,
      })),
    [currentResponse],
  );
  const pageActivity = React.useMemo(
    () =>
      presentedEntries.reduce(
        (summary, { entry }) => {
          summary[auditActionKind(entry.action)] += 1;
          return summary;
        },
        { create: 0, delete: 0, other: 0, update: 0 },
      ),
    [presentedEntries],
  );
  const detailBusiness = React.useMemo(
    () => (detail ? summarizeAuditBusinessData(detail.data) : null),
    [detail],
  );

  React.useEffect(() => {
    setPage(1);
    setPaginationCompanyId(companyScopeId);
    setPageEnvelope(null);
    setError("");
    setLoading(Boolean(companyScopeId));
    setRefreshing(false);
    setDetailOpen(false);
    setDetail(null);
  }, [companyScopeId]);

  React.useEffect(() => {
    if (paginationCompanyId !== companyScopeId) return;

    const requestSequence = ++listRequestSequenceRef.current;
    const controller = new AbortController();
    const hasCurrentData = Boolean(
      pageEnvelope?.companyId === companyScopeId &&
        pageEnvelope.page === page &&
        pageEnvelope.limit === limit,
    );

    if (!companyScopeId) {
      setPageEnvelope(null);
      setLoading(false);
      setRefreshing(false);
      return () => abortRequest(controller);
    }

    setError("");
    setLoading(!hasCurrentData);
    setRefreshing(hasCurrentData);

    void apiFetch<unknown>(auditListPath(page, limit), {
      companyScopeId,
      signal: controller.signal,
    })
      .then((payload) =>
        normalizePaginatedAuditResponse(payload, {
          companyId: companyScopeId,
          limit,
          page,
          partitionByCompanyId: masterCrossCompanyScope,
        }),
      )
      .then((response) => {
        if (
          controller.signal.aborted ||
          requestSequence !== listRequestSequenceRef.current
        ) {
          return;
        }
        const lastPage = Math.max(1, Math.ceil(response.total / response.limit));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setPageEnvelope({ companyId: companyScopeId, limit, page, response });
      })
      .catch((requestError: unknown) => {
        if (
          isAbortError(requestError, controller.signal) ||
          requestSequence !== listRequestSequenceRef.current
        ) {
          return;
        }
        setError(auditErrorMessage(requestError));
      })
      .finally(() => {
        if (
          controller.signal.aborted ||
          requestSequence !== listRequestSequenceRef.current
        ) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      abortRequest(
        controller,
        "A consulta de auditoria foi substituída por uma solicitação mais recente.",
      );
    };
    // pageEnvelope is deliberately excluded: it only determines whether the
    // same query can remain visible during an explicit refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    companyScopeId,
    limit,
    masterCrossCompanyScope,
    page,
    paginationCompanyId,
    reloadRevision,
  ]);

  function changePage(nextPage: number) {
    if (loading || refreshing || nextPage < 1 || nextPage > totalPages) return;
    setError("");
    setPage(nextPage);
  }

  function changeLimit(value: string) {
    const nextLimit = Number(value);
    if (!AUDIT_PAGE_SIZES.includes(nextLimit as (typeof AUDIT_PAGE_SIZES)[number])) {
      return;
    }
    setError("");
    setPage(1);
    setLimit(nextLimit);
  }

  function openDetail(entry: AuditLogEntry) {
    setDetail(entry);
    setDetailOpen(true);
  }

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
    if (open) return;
    setDetail(null);
  }

  if (!companyScopeId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auditoria</CardTitle>
          <CardDescription>
            Selecione uma empresa para consultar seus registros de auditoria.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AuditSummary
          label="Histórico"
          value={currentResponse ? formatNumber(currentResponse.total) : "—"}
          detail="Registros da empresa"
        />
        <AuditSummary
          label="Alterações"
          value={currentResponse ? formatNumber(pageActivity.update) : "—"}
          detail="Nesta página"
        />
        <AuditSummary
          label="Inclusões"
          value={currentResponse ? formatNumber(pageActivity.create) : "—"}
          detail="Nesta página"
        />
        <AuditSummary
          label="Exclusões"
          value={currentResponse ? formatNumber(pageActivity.delete) : "—"}
          detail="Nesta página"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 shrink-0 text-primary" />
              Histórico de auditoria
            </CardTitle>
            <CardDescription>
              Acompanhe as alterações realizadas na empresa selecionada.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={loading || refreshing}
            onClick={() => setReloadRevision((revision) => revision + 1)}
          >
            <RefreshCw
              className={cn("h-4 w-4", (loading || refreshing) && "animate-spin")}
            />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <AuditError
              message={error}
              onRetry={() => setReloadRevision((revision) => revision + 1)}
            />
          ) : null}

          {loading && !currentResponse ? (
            <AuditTableSkeleton />
          ) : currentResponse?.data.length ? (
            <Table scrollRegionLabel="Registros de auditoria">
              <TableHeader>
                <TableRow>
                  <TableHead>Data e hora</TableHead>
                  <TableHead>Atividade</TableHead>
                  <TableHead>O que mudou</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presentedEntries.map(({ business, entry }) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.created_at, companyTimeZone)}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-36 flex-col items-start gap-1.5">
                        <AuditActionBadge action={entry.action} />
                        <span className="text-xs font-medium text-muted-foreground">
                          {humanizeCode(entry.table_name)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-64">
                      <div className="max-w-xl text-sm leading-5 text-foreground">
                        {auditEntrySummary(entry, business)}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {auditOriginLabel(entry, user?.id, user?.name)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openDetail(entry)}
                          aria-label="Ver detalhes da alteração"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : error ? null : (
            <EmptyAuditState />
          )}

          {currentResponse ? (
            <div className="flex min-w-0 flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground" aria-live="polite">
                {currentResponse.data.length
                  ? `${formatNumber(firstVisible)}–${formatNumber(lastVisible)} de ${formatNumber(currentResponse.total)}`
                  : "Nenhum registro nesta página"}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Por página</span>
                <Select value={String(limit)} onValueChange={changeLimit}>
                  <SelectTrigger
                    className="h-8 w-[5.25rem]"
                    aria-label="Registros por página"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIT_PAGE_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading || refreshing}
                  onClick={() => changePage(page - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
                <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading || refreshing}
                  onClick={() => changePage(page + 1)}
                  aria-label="Próxima página"
                >
                  <span className="hidden sm:inline">Próxima</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={handleDetailOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalhes da alteração</DialogTitle>
            <DialogDescription>
              Resumo da atividade registrada no histórico da empresa.
            </DialogDescription>
          </DialogHeader>

          {detail && detailBusiness ? (
            <div className="min-w-0 space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Resumo da atividade
                </div>
                <p className="mt-1 text-sm leading-6 text-foreground">
                  {auditEntrySummary(detail, detailBusiness)}
                </p>
              </div>

              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <AuditMetadata
                  label="Data e hora"
                  value={formatDateTime(detail.created_at, companyTimeZone)}
                />
                <AuditMetadata
                  label="Ação"
                  value={humanizeAuditAction(detail.action)}
                />
                <AuditMetadata
                  label="Área alterada"
                  value={humanizeCode(detail.table_name)}
                />
                <AuditMetadata
                  label="Origem"
                  value={auditOriginLabel(detail, user?.id, user?.name)}
                />
              </div>

              {detailBusiness.changes.length ? (
                <section className="space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Alterações registradas
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Comparação dos dados de negócio antes e depois da ação.
                    </p>
                  </div>
                  <Table scrollRegionLabel="Alterações registradas na auditoria">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead>Antes</TableHead>
                        <TableHead>Depois</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailBusiness.changes.map((change, index) => (
                        <TableRow key={`${change.field}-${index}`}>
                          <TableCell className="font-medium">
                            {change.field}
                          </TableCell>
                          <TableCell className="min-w-40 break-words text-muted-foreground [overflow-wrap:anywhere]">
                            {change.before}
                          </TableCell>
                          <TableCell className="min-w-40 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                            {change.after}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              ) : null}

              {detailBusiness.details.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Informações relacionadas
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detailBusiness.details.map((item, index) => (
                      <AuditMetadata
                        key={`${item.field}-${index}`}
                        label={item.field}
                        value={item.value}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {!detailBusiness.changes.length &&
              !detailBusiness.details.length ? (
                <div className="rounded-md border border-dashed bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                  Nenhum detalhe adicional de negócio foi registrado para esta atividade.
                </div>
              ) : null}

              {detailBusiness.omittedCount ? (
                <p className="text-xs text-muted-foreground">
                  Mais {formatNumber(detailBusiness.omittedCount)} campo(s) foram
                  condensados para manter a leitura objetiva.
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AuditSummary({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function AuditActionBadge({ action }: { action: string }) {
  const kind = auditActionKind(action);
  const variant = kind === "delete"
    ? "destructive"
    : kind === "create"
      ? "success"
      : kind === "update"
        ? "warning"
        : "outline";

  return (
    <Badge variant={variant}>
      {humanizeAuditAction(action)}
    </Badge>
  );
}

function AuditMetadata({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-1 min-w-0 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]"
      >
        {value}
      </div>
    </div>
  );
}

function AuditError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex min-w-0 flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="min-w-0 text-sm leading-5 text-destructive">{message}</div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full shrink-0 sm:w-auto"
        onClick={onRetry}
      >
        Tentar novamente
      </Button>
    </div>
  );
}

function EmptyAuditState() {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center">
      <ScrollText className="mx-auto h-6 w-6 text-muted-foreground" />
      <div className="mt-3 text-sm font-medium text-foreground">
        Nenhum registro de auditoria
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Não há atividades registradas para esta empresa.
      </div>
    </div>
  );
}

function AuditTableSkeleton() {
  return (
    <div className="space-y-2" aria-label="Carregando registros de auditoria">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

function humanizeAuditAction(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("DELETE") || normalized.includes("REMOVE")) {
    return "Exclusão";
  }
  if (normalized.includes("CREATE") || normalized.includes("INSERT")) {
    return "Inclusão";
  }
  if (normalized.includes("GRANT") || normalized.includes("ASSIGN")) {
    return "Concessão de acesso";
  }
  if (normalized.includes("REVOKE")) return "Revogação de acesso";
  if (normalized.includes("ROTATE")) return "Renovação de credencial";
  if (normalized.includes("ENABLE") || normalized.includes("ACTIVATE")) {
    return "Ativação";
  }
  if (normalized.includes("DISABLE") || normalized.includes("DEACTIVATE")) {
    return "Desativação";
  }
  if (normalized.includes("LOGIN") || normalized.includes("SIGN_IN")) {
    return "Entrada no sistema";
  }
  if (normalized.includes("LOGOUT") || normalized.includes("SIGN_OUT")) {
    return "Saída do sistema";
  }
  if (auditActionKind(value) === "update") return "Alteração";
  return "Atividade";
}

function humanizeCode(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const labels: Record<string, string> = {
    audit: "Auditoria",
    audit_log: "Auditoria",
    audit_logs: "Auditoria",
    camera: "Câmeras",
    cameras: "Câmeras",
    company: "Empresas",
    company_module: "Módulos da empresa",
    company_modules: "Módulos da empresa",
    companies: "Empresas",
    dashboard_view: "Visões",
    dashboard_views: "Visões",
    line_count: "Linhas de contagem",
    line_counts: "Linhas de contagem",
    location: "Locais",
    locations: "Locais",
    module: "Módulos",
    modules: "Módulos",
    occupancy_area: "Áreas de ocupação",
    occupancy_areas: "Áreas de ocupação",
    occupancy_scenario: "Cenários de ocupação",
    occupancy_scenarios: "Cenários de ocupação",
    permission: "Acessos",
    permissions: "Acessos",
    scenario: "Cenários",
    scenarios: "Cenários",
    sub_location: "Setores",
    sub_locations: "Setores",
    user: "Usuários",
    user_grid: "Preferências de visualização",
    user_permission: "Acessos de usuários",
    user_permissions: "Acessos de usuários",
    users: "Usuários",
    worker: "Workers",
    workers: "Workers",
  };
  return labels[normalized] ?? "Configurações";
}

function auditActionKind(value: string): "create" | "delete" | "other" | "update" {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("DELETE") || normalized.includes("REMOVE")) {
    return "delete";
  }
  if (normalized.includes("CREATE") || normalized.includes("INSERT")) {
    return "create";
  }
  if (
    [
      "ACTIVATE",
      "ASSIGN",
      "DEACTIVATE",
      "DISABLE",
      "EDIT",
      "ENABLE",
      "GRANT",
      "REVOKE",
      "ROTATE",
      "UPDATE",
    ].some((term) => normalized.includes(term))
  ) {
    return "update";
  }
  return "other";
}

function auditEntrySummary(
  entry: AuditLogEntry,
  business: AuditBusinessPresentation,
) {
  const context = `${humanizeAuditAction(entry.action)} em ${humanizeCode(
    entry.table_name,
  )}${business.subject ? ` · ${business.subject}` : ""}`;
  const fields = business.changes.length
    ? business.changes.map((change) => change.field)
    : business.details.map((detail) => detail.field);
  const uniqueFields = [...new Set(fields)].slice(0, 3);
  if (!uniqueFields.length) return `${context}.`;
  const suffix = fields.length > uniqueFields.length ? " e outros campos" : "";
  return `${context}. ${
    business.changes.length ? "Campos alterados" : "Informações registradas"
  }: ${uniqueFields.join(", ")}${suffix}.`;
}

function auditOriginLabel(
  entry: AuditLogEntry,
  currentUserId?: string,
  currentUserName?: string,
) {
  if (!entry.user_id) return "Automação do sistema";
  if (currentUserId?.trim() && entry.user_id === currentUserId.trim()) {
    return currentUserName?.trim() || "Você";
  }
  return "Outro usuário autorizado";
}

function auditErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Seu perfil não possui acesso aos registros de auditoria desta empresa.";
    }
    if (error.status === 404) {
      return "O registro de auditoria solicitado não foi localizado.";
    }
    if (error.status >= 500) {
      return "O histórico de alterações está temporariamente indisponível.";
    }
  }
  return "Não foi possível carregar os registros de auditoria.";
}
