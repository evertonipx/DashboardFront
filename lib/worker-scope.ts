import type { Worker } from "@/lib/types";

export type WorkerScopeRow = Worker & {
  company_id?: string | null;
  client_id?: string | null;
  __identity_alias_ids?: string[];
  __duplicate_record_count?: number;
};

export type WorkerScopePartition<T extends WorkerScopeRow> = {
  scopedRows: T[];
  foreignRows: T[];
  unscopedRows: T[];
};

export function resolveWorkerCompanyId(worker: unknown) {
  return resolveWorkerExplicitCompanyId(worker);
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

export function collapseWorkerIdentityChains<T extends WorkerScopeRow>(
  rows: T[],
): T[] {
  if (rows.length < 2) return rows;

  const rowsById = new Map(
    rows
      .filter((row) => cleanString(row.id))
      .map((row) => [cleanString(row.id), row]),
  );
  const parent = new Map(rows.map((row) => [row, row]));

  function find(row: T): T {
    const current = parent.get(row) ?? row;
    if (current === row) return row;
    const root = find(current);
    parent.set(row, root);
    return root;
  }

  function union(left: T, right: T) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  }

  rows.forEach((row) => {
    const previous = rowsById.get(cleanString(row.name));
    if (!previous || previous === row || !workersCanShareIdentity(row, previous)) {
      return;
    }
    union(row, previous);
  });

  const components = new Map<T, T[]>();
  rows.forEach((row) => {
    const root = find(row);
    components.set(root, [...(components.get(root) ?? []), row]);
  });

  return Array.from(components.values()).map((component) => {
    if (component.length === 1) return component[0];

    const ordered = sortWorkersByActivity(component);
    const latest = ordered[0];
    const named = ordered.find((row) => {
      const name = cleanString(row.name);
      return name && !looksLikeIdentifier(name);
    });
    const aliases = Array.from(
      new Set(
        component.flatMap((row) => [
          cleanString(row.id),
          ...(row.__identity_alias_ids ?? []),
        ]),
      ),
    ).filter(Boolean);

    return {
      ...latest,
      name: named?.name || latest.name,
      __duplicate_record_count: component.reduce(
        (count, row) => count + (row.__duplicate_record_count ?? 1),
        0,
      ),
      __identity_alias_ids: aliases,
    } as T;
  });
}

export function workerIdentityIds(worker: WorkerScopeRow) {
  return Array.from(
    new Set(
      [worker.id, ...(worker.__identity_alias_ids ?? [])]
        .map(cleanString)
        .filter(Boolean),
    ),
  );
}

export function resolveWorkerExplicitCompanyId(worker: unknown) {
  if (!worker || typeof worker !== "object") return "";
  const companyId = (worker as Record<string, unknown>).company_id;
  return typeof companyId === "string" ? companyId.trim() : "";
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
      unscopedRows: [],
    };
  }

  const scopedRows: T[] = [];
  const foreignRows: T[] = [];
  const unscopedRows: T[] = [];

  rows.forEach((row) => {
    const explicitCompanyId = resolveWorkerExplicitCompanyId(row);
    if (!explicitCompanyId) {
      unscopedRows.push(row);
      return;
    }

    if (scopeIds.includes(explicitCompanyId)) {
      scopedRows.push(row);
    } else {
      foreignRows.push(row);
    }
  });

  return { scopedRows, foreignRows, unscopedRows };
}

export function workerScopeStatus(
  worker: WorkerScopeRow,
  companyId?: string | null,
) {
  const cleanCompanyId = companyId?.trim();
  const explicitCompanyId = resolveWorkerExplicitCompanyId(worker);
  const workerCompanyId = explicitCompanyId;

  if (!cleanCompanyId) return workerCompanyId ? "linked" : "unscoped";
  if (!workerCompanyId) return "unscoped";
  if (workerCompanyId !== cleanCompanyId) return "foreign";
  return "linked";
}

export function workerScopeDisplay(
  worker: WorkerScopeRow,
  companyId?: string | null,
) {
  const status = workerScopeStatus(worker, companyId);
  const workerCompanyId = resolveWorkerCompanyId(worker);

  if (status === "linked") {
    return {
      label: "Vinculado",
      detail: workerCompanyId,
      variant: "success" as const,
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
    label: "Sem vinculo explicito",
    detail: "API nao retornou company_id",
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

function workersCanShareIdentity(
  left: WorkerScopeRow,
  right: WorkerScopeRow,
) {
  const leftCompanyId = resolveWorkerCompanyId(left);
  const rightCompanyId = resolveWorkerCompanyId(right);
  if (
    leftCompanyId &&
    rightCompanyId &&
    leftCompanyId !== rightCompanyId
  ) {
    return false;
  }

  const leftHostname = cleanString(left.hostname).toLocaleLowerCase();
  const rightHostname = cleanString(right.hostname).toLocaleLowerCase();
  if (leftHostname && rightHostname && leftHostname !== rightHostname) {
    return false;
  }

  return true;
}

function looksLikeIdentifier(value: string) {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ) || /^[0-9a-f]{24,}$/i.test(value)
  );
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
