import { getEntityCompanyId, withCompanyScope } from "@/lib/master-company-scope";
import type { Worker } from "@/lib/types";

export type WorkerScopeRow = Worker & {
  company_id?: string | null;
  client_id?: string | null;
  __scoped_company_id?: string | null;
  __scope_source?: string | null;
};

export type WorkerScopePartition<T extends WorkerScopeRow> = {
  scopedRows: T[];
  foreignRows: T[];
  inferredRows: T[];
  unscopedRows: T[];
};

export function withWorkerCompanyScope<T extends object>(
  body: T,
  companyId?: string | null,
) {
  const cleanCompanyId = companyId?.trim();
  if (!cleanCompanyId) return body;

  const scopedBody = withCompanyScope(body, cleanCompanyId);
  const record = scopedBody as Record<string, unknown>;

  return {
    ...scopedBody,
    client_id: cleanString(record.client_id) || cleanCompanyId,
  };
}

export function withWorkerClientScope<T extends object>(
  body: T,
  companyId?: string | null,
) {
  const cleanCompanyId = companyId?.trim();
  if (!cleanCompanyId) return body;

  const record = body as Record<string, unknown>;
  return {
    ...body,
    client_id: cleanString(record.client_id) || cleanCompanyId,
  };
}

export function resolveWorkerCompanyId(worker: unknown) {
  return resolveWorkerExplicitCompanyId(worker) || resolveWorkerInferredCompanyId(worker);
}

export function normalizeWorkerRows(value: unknown): WorkerScopeRow[] {
  if (Array.isArray(value)) return value as WorkerScopeRow[];

  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  return (
    arrayValue<WorkerScopeRow>(record.data) ??
    arrayValue<WorkerScopeRow>(record.workers) ??
    arrayValue<WorkerScopeRow>(record.items) ??
    arrayValue<WorkerScopeRow>(record.results) ??
    []
  );
}

export function sortWorkersByActivity<T extends WorkerScopeRow>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const rightTime = workerActivityTime(right);
    const leftTime = workerActivityTime(left);
    if (rightTime !== leftTime) return rightTime - leftTime;
    return String(left.name || left.id || "").localeCompare(
      String(right.name || right.id || ""),
      "pt-BR",
    );
  });
}

export function resolveWorkerExplicitCompanyId(worker: unknown) {
  return getEntityCompanyId(worker);
}

export function resolveWorkerInferredCompanyId(worker: unknown) {
  if (!worker || typeof worker !== "object") return "";

  const record = worker as Record<string, unknown>;
  return (
    cleanString(record.__scoped_company_id) ||
    cleanString(record.scoped_company_id) ||
    cleanString(record.company_scope_id)
  );
}

export function annotateWorkerCompanyScope<T extends object>(
  worker: T,
  companyId?: string | null,
  source = "consulta escopada",
) {
  const cleanCompanyId = companyId?.trim();
  if (!cleanCompanyId) return worker;

  return {
    ...worker,
    __scoped_company_id: cleanCompanyId,
    __scope_source: source,
  };
}

export function partitionWorkersByCompanyScope<T extends WorkerScopeRow>(
  rows: T[],
  companyIds?: string | null | Array<string | null | undefined>,
): WorkerScopePartition<T> {
  const scopeIds = normalizeScopeIds(companyIds);
  if (!scopeIds.length) {
    return {
      scopedRows: rows,
      foreignRows: [],
      inferredRows: [],
      unscopedRows: [],
    };
  }

  const scopedRows: T[] = [];
  const foreignRows: T[] = [];
  const inferredRows: T[] = [];
  const unscopedRows: T[] = [];

  rows.forEach((row) => {
    const explicitCompanyId = resolveWorkerExplicitCompanyId(row);
    const inferredCompanyId = resolveWorkerInferredCompanyId(row);
    const rowCompanyId = explicitCompanyId || inferredCompanyId;

    if (!rowCompanyId) {
      unscopedRows.push(row);
      scopedRows.push(row);
      return;
    }

    if (scopeIds.includes(rowCompanyId)) {
      if (!explicitCompanyId && inferredCompanyId) inferredRows.push(row);
      scopedRows.push(row);
    } else {
      foreignRows.push(row);
    }
  });

  return { scopedRows, foreignRows, inferredRows, unscopedRows };
}

export function workerScopeStatus(
  worker: WorkerScopeRow,
  companyId?: string | null,
) {
  const cleanCompanyId = companyId?.trim();
  const explicitCompanyId = resolveWorkerExplicitCompanyId(worker);
  const inferredCompanyId = resolveWorkerInferredCompanyId(worker);
  const workerCompanyId = explicitCompanyId || inferredCompanyId;

  if (!cleanCompanyId) return workerCompanyId ? "linked" : "unscoped";
  if (!workerCompanyId) return "unscoped";
  if (workerCompanyId !== cleanCompanyId) return "foreign";
  return explicitCompanyId ? "linked" : "inferred";
}

export function workerScopeDisplay(
  worker: WorkerScopeRow,
  companyId?: string | null,
) {
  const status = workerScopeStatus(worker, companyId);
  const workerCompanyId = resolveWorkerCompanyId(worker);
  const source =
    worker.__scope_source?.trim() ||
    (resolveWorkerInferredCompanyId(worker) ? "consulta escopada" : "");

  if (status === "linked") {
    return {
      label: "Vinculado",
      detail: workerCompanyId,
      variant: "success" as const,
    };
  }

  if (status === "inferred") {
    return {
      label: "Vinculo inferido",
      detail: `${source}: ${workerCompanyId}`,
      variant: "warning" as const,
    };
  }

  if (status === "foreign") {
    return {
      label: "Outra empresa",
      detail: workerCompanyId,
      variant: "destructive" as const,
    };
  }

  return {
    label: "Sem vinculo",
    detail: "API nao retornou company_id/client_id",
    variant: "warning" as const,
  };
}

function normalizeScopeIds(
  companyIds?: string | null | Array<string | null | undefined>,
) {
  const values = Array.isArray(companyIds) ? companyIds : [companyIds];
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function arrayValue<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function workerActivityTime(worker: WorkerScopeRow) {
  const record = worker as Record<string, unknown>;
  return firstTimestamp(record, [
    "last_seen_at",
    "lastSeenAt",
    "last_heartbeat_at",
    "lastHeartbeatAt",
    "heartbeat_at",
    "heartbeatAt",
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
  ]);
}

function firstTimestamp(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const timestamp =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Date.parse(value)
          : Number.NaN;
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return 0;
}
