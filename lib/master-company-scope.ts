"use client";

import * as React from "react";
import type { CurrentUser } from "@/lib/types";
import { isMasterUser } from "@/lib/user-role";

export type MasterCompanyScope = {
  id: string;
  name: string;
  trade_name?: string | null;
};

export const MASTER_COMPANY_SCOPE_EVENT = "ipxdata:master-company-scope";

const MASTER_COMPANY_SCOPE_KEY = "ipxdata-master-company-scope-v1";
const CURRENT_COMPANY_SCOPE_KEY = "ipxdata-current-company-scope-v1";

export function getStoredMasterCompanyScope() {
  return readStoredCompanyScope(MASTER_COMPANY_SCOPE_KEY);
}

export function setStoredMasterCompanyScope(scope: MasterCompanyScope) {
  writeStoredCompanyScope(MASTER_COMPANY_SCOPE_KEY, scope);
}

export function clearStoredMasterCompanyScope() {
  clearStoredCompanyScope(MASTER_COMPANY_SCOPE_KEY);
}

export function getStoredCurrentCompanyScope() {
  return readStoredCompanyScope(CURRENT_COMPANY_SCOPE_KEY);
}

export function setStoredCurrentCompanyScope(scope: MasterCompanyScope) {
  writeStoredCompanyScope(CURRENT_COMPANY_SCOPE_KEY, scope);
}

export function clearStoredCurrentCompanyScope() {
  clearStoredCompanyScope(CURRENT_COMPANY_SCOPE_KEY);
}

export function getStoredApiCompanyScope() {
  return getStoredMasterCompanyScope() ?? getStoredCurrentCompanyScope();
}

export function getEffectiveCompanyScopeId(user: CurrentUser | null) {
  const userCompanyId = getCurrentUserCompanyId(user);

  if (isMasterUser(user)) {
    return getStoredMasterCompanyScope()?.id ?? "";
  }

  return userCompanyId;
}

export function getCurrentUserCompanyId(user: CurrentUser | null) {
  return getEntityCompanyId(user);
}

export function useEffectiveCompanyScopeId(user: CurrentUser | null) {
  const [companyScopeId, setCompanyScopeId] = React.useState(() =>
    getEffectiveCompanyScopeId(user),
  );

  React.useEffect(() => {
    function syncScope() {
      setCompanyScopeId(getEffectiveCompanyScopeId(user));
    }

    syncScope();
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncScope);
    window.addEventListener("storage", syncScope);

    return () => {
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncScope);
      window.removeEventListener("storage", syncScope);
    };
  }, [user]);

  return companyScopeId;
}

export function getScopedStorageKey(baseKey: string, companyId?: string | null) {
  const cleanCompanyId = companyId?.trim();
  return cleanCompanyId ? `${baseKey}.${cleanCompanyId}` : baseKey;
}

export function getUserViewScopedStorageKey(
  baseKey: string,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const segments = [
    companyId?.trim() ? `company.${encodeStorageSegment(companyId)}` : "",
    userId?.trim() ? `user.${encodeStorageSegment(userId)}` : "",
    viewId?.trim() ? `view.${encodeStorageSegment(viewId)}` : "",
  ].filter(Boolean);

  return segments.length ? `${baseKey}.${segments.join(".")}` : baseKey;
}

export function getEntityCompanyId(value: unknown) {
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const nestedCompany =
    record.company && typeof record.company === "object"
      ? (record.company as Record<string, unknown>)
      : null;
  const nestedTenant =
    record.tenant && typeof record.tenant === "object"
      ? (record.tenant as Record<string, unknown>)
      : null;
  const nestedOrganization =
    record.organization && typeof record.organization === "object"
      ? (record.organization as Record<string, unknown>)
      : null;
  const nestedCustomer =
    record.customer && typeof record.customer === "object"
      ? (record.customer as Record<string, unknown>)
      : null;
  const nestedAccount =
    record.account && typeof record.account === "object"
      ? (record.account as Record<string, unknown>)
      : null;
  const companyId =
    record.company_id ??
    record.companyId ??
    record.companyID ??
    record.company_uuid ??
    record.companyUuid ??
    record.client_id ??
    record.clientId ??
    record.clientID ??
    record.tenant_id ??
    record.tenantId ??
    record.tenantID ??
    record.organization_id ??
    record.organizationId ??
    record.organizationID ??
    record.customer_id ??
    record.customerId ??
    record.customerID ??
    record.account_id ??
    record.accountId ??
    record.accountID ??
    record.owner_company_id ??
    record.ownerCompanyId ??
    nestedCompany?.id ??
    nestedTenant?.id ??
    nestedOrganization?.id ??
    nestedCustomer?.id ??
    nestedAccount?.id;

  return (
    toCleanId(companyId) ||
    getEmbeddedIdentifier(record, [
      "company_id",
      "companyId",
      "companyID",
      "tenant_id",
      "tenantId",
      "client_id",
      "clientId",
      "organization_id",
      "customer_id",
      "account_id",
    ])
  );
}

export function getEntityUserId(value: unknown) {
  return getRelatedEntityId(
    value,
    [
      "user_id",
      "userId",
      "userID",
      "auth_user_id",
      "authUserId",
      "authUserID",
      "owner_user_id",
      "ownerUserId",
      "created_by_user_id",
      "createdByUserId",
      "created_by_id",
      "createdById",
      "created_by",
      "createdBy",
      "operator_id",
      "operatorId",
      "admin_user_id",
      "adminUserId",
    ],
    [
      "user",
      "owner",
      "created_by_user",
      "createdByUser",
      "created_by",
      "createdBy",
      "operator",
      "admin_user",
      "adminUser",
    ],
    ["auth_user_id", "user_id", "created_by_user_id", "owner_user_id"],
  );
}

export function getEntityWorkerId(value: unknown) {
  return getRelatedEntityId(
    value,
    [
      "worker_id",
      "workerId",
      "workerID",
      "local_worker_id",
      "localWorkerId",
      "edge_worker_id",
      "edgeWorkerId",
    ],
    ["worker", "edge_worker", "edgeWorker"],
    ["worker_id", "local_worker_id", "edge_worker_id"],
  );
}

export function getEntityLocationId(value: unknown) {
  return getRelatedEntityId(
    value,
    ["location_id", "locationId", "locationID"],
    ["location"],
    ["location_id"],
  );
}

export function getEntitySubLocationId(value: unknown) {
  return getRelatedEntityId(
    value,
    [
      "sub_location_id",
      "subLocationId",
      "subLocationID",
      "sublocation_id",
      "sublocationId",
    ],
    ["sub_location", "subLocation", "sublocation"],
    ["sub_location_id", "sublocation_id"],
  );
}

export function getEntityCameraId(value: unknown) {
  return getRelatedEntityId(
    value,
    ["camera_id", "cameraId", "cameraID"],
    ["camera"],
    ["camera_id"],
  );
}

function getRelatedEntityId(
  value: unknown,
  directKeys: string[],
  nestedKeys: string[],
  embeddedKeys: string[] = directKeys,
) {
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of directKeys) {
    const directValue = toCleanId(record[key]);
    if (directValue) return directValue;
  }

  for (const key of nestedKeys) {
    const nested = record[key];
    if (!nested || typeof nested !== "object") continue;

    const nestedValue = toCleanId((nested as Record<string, unknown>).id);
    if (nestedValue) return nestedValue;
  }

  return getEmbeddedIdentifier(record, embeddedKeys);
}

function toCleanId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getEmbeddedIdentifier(
  record: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const directValue = toCleanId(record[key]);
    if (directValue) return directValue;
  }

  const candidates = [
    record.description,
    record.notes,
    record.metadata,
    record.data,
    record.payload,
  ];

  for (const candidate of candidates) {
    const value = getEmbeddedIdentifierFromValue(candidate, keys);
    if (value) return value;
  }

  return "";
}

function getEmbeddedIdentifierFromValue(value: unknown, keys: string[]) {
  if (!value) return "";

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const directValue = toCleanId(record[key]);
      if (directValue) return directValue;
    }
    return "";
  }

  if (typeof value !== "string") return "";

  for (const key of keys) {
    const pattern = new RegExp(
      `(?:^|[\\s;,|])${escapeRegExp(key)}\\s*[=:]\\s*([^\\s;,|]+)`,
      "i",
    );
    const match = value.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function encodeStorageSegment(value: string) {
  return encodeURIComponent(value.trim()).replace(/\./g, "%2E");
}

export function belongsToCompanyScope(
  value: unknown,
  companyId?: string | null,
  { allowUnscoped = false }: { allowUnscoped?: boolean } = {},
) {
  const cleanCompanyId = companyId?.trim();
  if (!cleanCompanyId) return true;

  const entityCompanyId = getEntityCompanyId(value);
  if (!entityCompanyId) return allowUnscoped;

  return entityCompanyId === cleanCompanyId;
}

export function filterByCompanyScope<T>(
  rows: T[],
  companyId?: string | null,
  options?: { allowUnscoped?: boolean },
) {
  const cleanCompanyId = companyId?.trim();
  if (!cleanCompanyId) return rows;

  return rows.filter((row) => belongsToCompanyScope(row, cleanCompanyId, options));
}

export function filterScopedApiRows<T>(
  rows: T[],
  companyId?: string | null,
  options: {
    allowUnscoped?: boolean;
    resolveCompanyId?: (row: T) => string | null | undefined;
  } = {},
) {
  const cleanCompanyId = companyId?.trim();
  if (!cleanCompanyId) return rows;

  const hasForeignCompanyRows = rows.some((row) => {
    const entityCompanyId = getScopedRowCompanyId(row, options.resolveCompanyId);
    return entityCompanyId && entityCompanyId !== cleanCompanyId;
  });

  return rows.filter((row) => {
    const entityCompanyId = getScopedRowCompanyId(row, options.resolveCompanyId);
    if (!entityCompanyId) return options.allowUnscoped ?? !hasForeignCompanyRows;
    return entityCompanyId === cleanCompanyId;
  });
}

export function getScopedRowCompanyId<T>(
  row: T,
  resolveCompanyId?: (row: T) => string | null | undefined,
) {
  const directCompanyId = getEntityCompanyId(row);
  if (directCompanyId) return directCompanyId;

  return resolveCompanyId?.(row)?.trim() ?? "";
}

export function withCompanyScope<T extends object>(
  body: T,
  companyId?: string | null,
) {
  const cleanCompanyId = companyId?.trim();
  const record = body as Record<string, unknown>;
  if (!cleanCompanyId || record.company_id) return body;

  return {
    ...body,
    company_id: cleanCompanyId,
  };
}

function readStoredCompanyScope(key: string) {
  if (typeof window === "undefined") return null;

  try {
    const rawScope = window.localStorage.getItem(key);
    if (!rawScope) return null;

    const scope = JSON.parse(rawScope) as MasterCompanyScope;
    return scope?.id && scope?.name ? scope : null;
  } catch {
    return null;
  }
}

function writeStoredCompanyScope(key: string, scope: MasterCompanyScope) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(key, JSON.stringify(scope));
  window.dispatchEvent(new Event(MASTER_COMPANY_SCOPE_EVENT));
}

function clearStoredCompanyScope(key: string) {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(key);
  window.dispatchEvent(new Event(MASTER_COMPANY_SCOPE_EVENT));
}
