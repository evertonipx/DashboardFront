import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";

const MAX_AUDIT_DATA_INPUT_LENGTH = 2_000_000;
const MAX_AUDIT_DATA_OUTPUT_LENGTH = 120_000;
const MAX_AUDIT_BUSINESS_INPUT_LENGTH = 100_000;
const MAX_AUDIT_BUSINESS_CHANGES = 12;
const MAX_AUDIT_BUSINESS_DETAILS = 10;
const REDACTED_VALUE = "[REDACTED]";

const AUDIT_BEFORE_CONTAINER_KEYS = new Set([
  "before",
  "old",
  "old_data",
  "old_values",
  "previous",
  "previous_values",
]);
const AUDIT_AFTER_CONTAINER_KEYS = new Set([
  "after",
  "current",
  "current_values",
  "new",
  "new_data",
  "new_values",
]);
const AUDIT_CHANGE_CONTAINER_KEYS = new Set([
  "changed_fields",
  "changes",
  "diff",
  "differences",
]);
const AUDIT_BUSINESS_FIELD_LABELS: Record<string, string> = {
  active: "Status",
  can_create: "Permissão para criar",
  can_delete: "Permissão para excluir",
  can_edit: "Permissão para editar",
  can_export: "Permissão para exportar",
  can_view: "Permissão para visualizar",
  capacity: "Capacidade",
  cnpj: "CNPJ",
  description: "Descrição",
  display_name: "Nome de exibição",
  email: "E-mail",
  enabled: "Disponibilidade",
  end_time: "Horário final",
  full_name: "Nome completo",
  is_master: "Superadmin",
  label: "Identificação",
  location_name: "Local",
  metric_type: "Métrica",
  module: "Módulo",
  module_name: "Módulo",
  name: "Nome",
  object_class: "Classe monitorada",
  occupancy_percentage: "Ocupação",
  people_count: "Quantidade de pessoas",
  permission: "Permissão",
  permission_name: "Permissão",
  plan: "Plano",
  role: "Perfil de acesso",
  scenario_name: "Cenário",
  start_time: "Horário inicial",
  status: "Status",
  sub_location_name: "Setor",
  threshold: "Limite",
  timezone: "Fuso horário",
  title: "Título",
  trade_name: "Nome fantasia",
  user_limit: "Limite de usuários",
  user_name: "Usuário",
  worker_name: "Worker",
};

type CollectedAuditBusinessField = {
  key: string;
  label: string;
  value: string;
};

type CollectedAuditBusinessChange = {
  key: string;
  label: string;
  before: string;
  after: string;
};

export type AuditLogEntry = {
  action: string;
  company_id: string;
  created_at: string;
  data: string;
  id: string;
  ip_address: string;
  record_id: string;
  request_id: string;
  table_name: string;
  user_id: string;
};

export type PaginatedAuditResponse = {
  data: AuditLogEntry[];
  limit: number;
  page: number;
  total: number;
};

export type AuditDataFormat =
  | "base64-json"
  | "base64-text"
  | "empty"
  | "json"
  | "oversized"
  | "text";

export type AuditDataPresentation = {
  format: AuditDataFormat;
  text: string;
  truncated: boolean;
};

export type AuditBusinessChange = {
  field: string;
  before: string;
  after: string;
};

export type AuditBusinessDetail = {
  field: string;
  value: string;
};

export type AuditBusinessPresentation = {
  changes: AuditBusinessChange[];
  details: AuditBusinessDetail[];
  omittedCount: number;
  subject: string;
};

type AuditPageExpectation = {
  companyId?: string;
  limit?: number;
  page?: number;
  partitionByCompanyId?: boolean;
};

type AuditEntryExpectation = {
  companyId?: string;
  id?: string;
};

export function auditListPath(page: number, limit: number) {
  const safePage = requireInteger(page, "page", { minimum: 1 });
  const safeLimit = requireInteger(limit, "limit", {
    maximum: 200,
    minimum: 1,
  });
  const params = new URLSearchParams({
    limit: String(safeLimit),
    page: String(safePage),
  });
  return `/audit?${params.toString()}`;
}

export function auditDetailPath(id: string | number) {
  return `/audit/${encodeURIComponent(normalizeAuditLogId(id))}`;
}

export function normalizePaginatedAuditResponse(
  value: unknown,
  expectation: AuditPageExpectation = {},
): PaginatedAuditResponse {
  const record = requireRecord(value, "resposta paginada de auditoria");
  if (!Array.isArray(record.data)) {
    throw new Error("A API retornou uma coleção de auditoria inválida.");
  }

  const page = requireInteger(record.page, "page", { minimum: 1 });
  const limit = requireInteger(record.limit, "limit", {
    maximum: 200,
    minimum: 1,
  });
  const total = requireInteger(record.total, "total", { minimum: 0 });

  if (expectation.page !== undefined && page !== expectation.page) {
    throw new Error(
      `A API retornou a página ${page}, mas a página solicitada foi ${expectation.page}.`,
    );
  }
  if (expectation.limit !== undefined && limit !== expectation.limit) {
    throw new Error(
      `A API retornou limite ${limit}, mas o limite solicitado foi ${expectation.limit}.`,
    );
  }
  if (record.data.length > limit) {
    throw new Error(
      `A API retornou ${record.data.length} registros de auditoria para um limite de ${limit}.`,
    );
  }
  if (record.data.length > total) {
    throw new Error(
      "A API retornou mais registros de auditoria do que o total informado.",
    );
  }

  const scopedRows =
    expectation.partitionByCompanyId && expectation.companyId
      ? selectExplicitCompanyScopedRows(record.data, expectation.companyId, {
          label: "registros de auditoria",
        }).rows
      : record.data;

  const data = scopedRows.map((entry, index) =>
    normalizeAuditLogEntry(entry, {
      companyId: expectation.companyId,
      location: `na posição ${index}`,
    }),
  );

  return { data, limit, page, total };
}

export function normalizeAuditLogResponse(
  value: unknown,
  expectation: AuditEntryExpectation = {},
) {
  return normalizeAuditLogEntry(value, {
    ...expectation,
    location: "no detalhe",
  });
}

export function normalizeAuditLogId(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(
        "A API retornou um ID BIGINT de auditoria que não pode ser representado com segurança.",
      );
    }
    return String(value);
  }

  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    throw new Error("A API retornou um ID de auditoria inválido.");
  }

  const normalized = BigInt(value.trim());
  if (normalized < BigInt(1)) {
    throw new Error("A API retornou um ID de auditoria inválido.");
  }
  return normalized.toString();
}

export function decodeAuditData(value: string): AuditDataPresentation {
  const raw = value.trim();
  if (!raw) {
    return { format: "empty", text: "Sem dados adicionais.", truncated: false };
  }

  if (raw.length > MAX_AUDIT_DATA_INPUT_LENGTH) {
    return {
      format: "oversized",
      text: "Detalhes adicionais indisponíveis para este registro.",
      truncated: true,
    };
  }

  const directJson = parseJson(raw);
  if (directJson.parsed) {
    return presentAuditValue(directJson.value, "json");
  }

  const decoded = decodeBase64Utf8(raw);
  if (decoded !== null) {
    const decodedJson = parseJson(decoded.trim());
    if (decodedJson.parsed) {
      return presentAuditValue(decodedJson.value, "base64-json");
    }

    return presentAuditText(decoded, "base64-text");
  }

  return presentAuditText(raw, "text");
}

export function redactAuditValue(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>(), 0);
}

/**
 * Converts the opaque audit payload into a compact business presentation.
 * Only explicitly useful fields are admitted. Identifiers, request metadata,
 * network data and credentials therefore never reach the visual layer.
 */
export function summarizeAuditBusinessData(
  value: string,
): AuditBusinessPresentation {
  const empty = emptyAuditBusinessPresentation();
  if (!value.trim() || value.length > MAX_AUDIT_BUSINESS_INPUT_LENGTH) {
    return empty;
  }

  const decoded = decodeAuditData(value);
  if (
    decoded.truncated ||
    (decoded.format !== "json" && decoded.format !== "base64-json")
  ) {
    return empty;
  }

  const parsed = parseJson(decoded.text);
  if (!parsed.parsed || !isPlainRecord(parsed.value)) return empty;

  const root = parsed.value;
  const changeContainer = firstRecord(root, AUDIT_CHANGE_CONTAINER_KEYS);
  const beforeRecord =
    firstRecord(root, AUDIT_BEFORE_CONTAINER_KEYS) ??
    (changeContainer
      ? firstRecord(changeContainer, AUDIT_BEFORE_CONTAINER_KEYS)
      : null);
  const afterRecord =
    firstRecord(root, AUDIT_AFTER_CONTAINER_KEYS) ??
    (changeContainer
      ? firstRecord(changeContainer, AUDIT_AFTER_CONTAINER_KEYS)
      : null);
  const structuredChanges = extractStructuredAuditChanges(root);
  const beforeFields = beforeRecord
    ? collectAuditBusinessFields(beforeRecord)
    : new Map<string, CollectedAuditBusinessField>();
  const afterFields = afterRecord
    ? collectAuditBusinessFields(afterRecord)
    : new Map<string, CollectedAuditBusinessField>();
  const comparedChanges =
    beforeRecord && afterRecord
      ? compareAuditBusinessFields(beforeFields, afterFields)
      : [];
  const changeMap = new Map<string, CollectedAuditBusinessChange>();

  [...comparedChanges, ...structuredChanges].forEach((change) => {
    changeMap.set(change.key, change);
  });

  const detailSource = afterRecord ?? beforeRecord ?? root;
  const detailFields = collectAuditBusinessFields(detailSource);
  const subject = auditBusinessSubject(
    afterFields.size
      ? afterFields
      : beforeFields.size
        ? beforeFields
        : detailFields,
  );
  const allChanges = [...changeMap.values()];
  const allDetails = [...detailFields.values()].filter(
    (detail) => !changeMap.has(detail.key),
  );
  const changes = allChanges.slice(0, MAX_AUDIT_BUSINESS_CHANGES).map(
    ({ after, before, label }) => ({ after, before, field: label }),
  );
  const details = allDetails.slice(0, MAX_AUDIT_BUSINESS_DETAILS).map(
    ({ label, value: detailValue }) => ({
      field: label,
      value: detailValue,
    }),
  );

  return {
    changes,
    details,
    omittedCount:
      Math.max(0, allChanges.length - changes.length) +
      Math.max(0, allDetails.length - details.length),
    subject,
  };
}

function emptyAuditBusinessPresentation(): AuditBusinessPresentation {
  return { changes: [], details: [], omittedCount: 0, subject: "" };
}

function firstRecord(
  record: Record<string, unknown>,
  acceptedKeys: ReadonlySet<string>,
) {
  for (const [key, child] of Object.entries(record)) {
    if (acceptedKeys.has(normalizeAuditBusinessKey(key)) && isPlainRecord(child)) {
      return child;
    }
  }
  return null;
}

function extractStructuredAuditChanges(
  root: Record<string, unknown>,
): CollectedAuditBusinessChange[] {
  const container = firstRecord(root, AUDIT_CHANGE_CONTAINER_KEYS) ?? root;
  const changes: CollectedAuditBusinessChange[] = [];

  Object.entries(container).forEach(([rawKey, rawValue]) => {
    const key = normalizeAuditBusinessKey(rawKey);
    const label = AUDIT_BUSINESS_FIELD_LABELS[key];
    if (!label || !isPlainRecord(rawValue)) return;

    const beforeValue = firstDefinedValue(rawValue, [
      "before",
      "from",
      "old",
      "previous",
    ]);
    const afterValue = firstDefinedValue(rawValue, [
      "after",
      "current",
      "new",
      "to",
    ]);
    if (!beforeValue.found && !afterValue.found) return;

    const before = beforeValue.found
      ? formatAuditBusinessValue(beforeValue.value, key)
      : "—";
    const after = afterValue.found
      ? formatAuditBusinessValue(afterValue.value, key)
      : "—";
    if (!before || !after || before === after) return;
    changes.push({ after, before, key, label });
  });

  return changes;
}

function compareAuditBusinessFields(
  beforeFields: Map<string, CollectedAuditBusinessField>,
  afterFields: Map<string, CollectedAuditBusinessField>,
) {
  const changes: CollectedAuditBusinessChange[] = [];
  const keys = new Set([...beforeFields.keys(), ...afterFields.keys()]);

  keys.forEach((key) => {
    const before = beforeFields.get(key);
    const after = afterFields.get(key);
    const beforeValue = before?.value ?? "—";
    const afterValue = after?.value ?? "—";
    if (beforeValue === afterValue) return;
    changes.push({
      after: afterValue,
      before: beforeValue,
      key,
      label: after?.label ?? before?.label ?? key,
    });
  });

  return changes;
}

function collectAuditBusinessFields(
  value: unknown,
  fields = new Map<string, CollectedAuditBusinessField>(),
  depth = 0,
) {
  if (depth > 5 || !isPlainRecord(value)) return fields;

  Object.entries(value).forEach(([rawKey, child]) => {
    const key = normalizeAuditBusinessKey(rawKey);
    if (
      AUDIT_BEFORE_CONTAINER_KEYS.has(key) ||
      AUDIT_CHANGE_CONTAINER_KEYS.has(key)
    ) {
      return;
    }

    const label = AUDIT_BUSINESS_FIELD_LABELS[key];
    if (label && !fields.has(key)) {
      const formatted = formatAuditBusinessValue(child, key);
      if (formatted) fields.set(key, { key, label, value: formatted });
    }

    if (isPlainRecord(child)) {
      collectAuditBusinessFields(child, fields, depth + 1);
      return;
    }
    if (Array.isArray(child)) {
      child.slice(0, 20).forEach((item) => {
        if (isPlainRecord(item)) {
          collectAuditBusinessFields(item, fields, depth + 1);
        }
      });
    }
  });

  return fields;
}

function firstDefinedValue(
  record: Record<string, unknown>,
  acceptedKeys: readonly string[],
) {
  for (const [key, value] of Object.entries(record)) {
    if (acceptedKeys.includes(normalizeAuditBusinessKey(key))) {
      return { found: true as const, value };
    }
  }
  return { found: false as const, value: undefined };
}

function formatAuditBusinessValue(value: unknown, key: string): string {
  if (value === undefined) return "";
  if (value === null) return "Não informado";
  if (typeof value === "boolean") {
    if (key === "active" || key === "status") {
      return value ? "Ativo" : "Inativo";
    }
    if (key === "enabled") return value ? "Habilitado" : "Desabilitado";
    return value ? "Sim" : "Não";
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)
      : "";
  }
  if (typeof value === "string") {
    const clean = value.trim();
    if (!clean || clean === REDACTED_VALUE) return "";
    return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
  }
  if (Array.isArray(value)) {
    const items = value
      .filter(
        (item) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      )
      .slice(0, 5)
      .map((item) => formatAuditBusinessValue(item, key))
      .filter(Boolean);
    return items.length ? items.join(", ") : "";
  }
  return "";
}

function auditBusinessSubject(
  fields: Map<string, CollectedAuditBusinessField>,
) {
  for (const key of ["name", "trade_name", "display_name", "title", "email", "label"]) {
    const value = fields.get(key)?.value;
    if (value) return value;
  }
  return "";
}

function normalizeAuditBusinessKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeAuditLogEntry(
  value: unknown,
  expectation: AuditEntryExpectation & { location?: string },
): AuditLogEntry {
  const location = expectation.location ? ` ${expectation.location}` : "";
  const record = requireRecord(value, `registro de auditoria${location}`);
  const id = normalizeAuditLogId(record.id);
  const companyId = requireNonEmptyString(
    record.company_id,
    `company_id do registro de auditoria${location}`,
  );
  const expectedCompanyId = expectation.companyId?.trim();
  if (expectedCompanyId && companyId !== expectedCompanyId) {
    throw new Error(
      `A API retornou company_id "${companyId}" fora da empresa autenticada "${expectedCompanyId}"${location}.`,
    );
  }

  if (expectation.id && id !== normalizeAuditLogId(expectation.id)) {
    throw new Error(
      `A API retornou o registro de auditoria ${id}, mas o registro solicitado foi ${expectation.id}.`,
    );
  }

  const createdAt = requireNonEmptyString(
    record.created_at,
    `created_at do registro de auditoria${location}`,
  );
  if (Number.isNaN(new Date(createdAt).getTime())) {
    throw new Error(
      `A API retornou created_at inválido no registro de auditoria${location}.`,
    );
  }

  return {
    action: requireNonEmptyString(
      record.action,
      `action do registro de auditoria${location}`,
    ),
    company_id: companyId,
    created_at: createdAt,
    data: optionalString(record.data, `data do registro de auditoria${location}`),
    id,
    ip_address: optionalString(
      record.ip_address,
      `ip_address do registro de auditoria${location}`,
    ),
    record_id: optionalString(
      record.record_id,
      `record_id do registro de auditoria${location}`,
    ),
    request_id: optionalString(
      record.request_id,
      `request_id do registro de auditoria${location}`,
    ),
    table_name: requireNonEmptyString(
      record.table_name,
      `table_name do registro de auditoria${location}`,
    ),
    user_id: optionalString(
      record.user_id,
      `user_id do registro de auditoria${location}`,
    ),
  };
}

function presentAuditValue(
  value: unknown,
  format: Extract<AuditDataFormat, "base64-json" | "json">,
): AuditDataPresentation {
  const redacted = redactAuditValue(value);
  const serialized = JSON.stringify(redacted, null, 2) ?? String(redacted);
  return truncatePresentation(serialized, format);
}

function presentAuditText(
  value: string,
  format: Extract<AuditDataFormat, "base64-text" | "text">,
): AuditDataPresentation {
  return truncatePresentation(redactSensitiveText(value), format);
}

function truncatePresentation(
  value: string,
  format: AuditDataFormat,
): AuditDataPresentation {
  if (value.length <= MAX_AUDIT_DATA_OUTPUT_LENGTH) {
    return { format, text: value, truncated: false };
  }

  return {
    format,
    text: `${value.slice(0, MAX_AUDIT_DATA_OUTPUT_LENGTH)}\n\n[Conteúdo truncado para preservar a responsividade]`,
    truncated: true,
  };
}

function redactValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > 50) return "[DEPTH LIMIT]";
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const result = value.map((item) => redactValue(item, seen, depth + 1));
    seen.delete(value);
    return result;
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactSensitiveText(value) : value;
  }

  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const result: Record<string, unknown> = Object.create(null);
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    result[key] = sensitiveAuditKey(key)
      ? REDACTED_VALUE
      : redactValue(child, seen, depth + 1);
  });
  seen.delete(value);
  return result;
}

function sensitiveAuditKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return [
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "password",
    "passwd",
    "privatekey",
    "refreshtoken",
    "secret",
    "senha",
    "sessiontoken",
    "accesstoken",
    "token",
  ].some(
    (term) =>
      normalized === term ||
      normalized.endsWith(term) ||
      normalized.startsWith(term),
  );
}

function redactSensitiveText(value: string) {
  return value.replace(
    /\b(authorization|access[\s_-]*token|refresh[\s_-]*token|session[\s_-]*token|api[\s_-]*key|private[\s_-]*key|password|passwd|senha|secret|cookie)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,;\r\n}]*)/gi,
    (_match, label: string) => `${label}: ${REDACTED_VALUE}`,
  );
}

function decodeBase64Utf8(value: string) {
  let compact = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (compact.length < 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    return null;
  }
  if (compact.length % 4 === 1) return null;
  compact = compact.padEnd(compact.length + ((4 - (compact.length % 4)) % 4), "=");

  try {
    const binary = globalThis.atob(compact);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return isReadableText(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function isReadableText(value: string) {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 && character !== "\n" && character !== "\r" && character !== "\t") {
      return false;
    }
  }
  return true;
}

function parseJson(value: string):
  | { parsed: false }
  | { parsed: true; value: unknown } {
  try {
    return { parsed: true, value: JSON.parse(value) as unknown };
  } catch {
    return { parsed: false };
  }
}

function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`A API retornou ${label} inválido.`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`A API retornou ${label} inválido.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`A API retornou ${label} inválido.`);
  }
  return value.trim();
}

function requireInteger(
  value: unknown,
  label: string,
  limits: { maximum?: number; minimum?: number } = {},
) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`A API retornou ${label} inválido na auditoria.`);
  }
  const integer = value as number;
  if (limits.minimum !== undefined && integer < limits.minimum) {
    throw new Error(`A API retornou ${label} inválido na auditoria.`);
  }
  if (limits.maximum !== undefined && integer > limits.maximum) {
    throw new Error(`A API retornou ${label} inválido na auditoria.`);
  }
  return integer;
}
