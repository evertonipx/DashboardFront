"use client";

import * as React from "react";
import {
  COMPANY_CACHE_EVENT,
  readCachedCompany,
} from "@/lib/company-cache";
import {
  DEFAULT_COMPANY_TIME_ZONE,
  resolveCompanyTimeZone,
  type CompanyTimeZoneCandidate,
  type CompanyTimeZoneResolution,
} from "@/lib/company-time-zone";
import type { CurrentUser } from "@/lib/types";
import {
  hasUserGridKnownDeletion,
  writeUserGridPreference,
} from "@/lib/user-grid-local";
import { isMasterUser } from "@/lib/user-role";

export type MasterCompanyScope = {
  id: string;
  name: string;
  timezone?: string | null;
  trade_name?: string | null;
};

export type CompanyScopeTimeZoneCertification = {
  companyScopeId: string;
  error?: string;
  timeZone?: string;
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

export function getEffectiveCompanyTimeZoneResolution(
  user: CurrentUser | null,
): CompanyTimeZoneResolution {
  const master = isMasterUser(user);
  const userCompanyId = getCurrentUserCompanyId(user);
  const storedScope = master
    ? getStoredMasterCompanyScope()
    : getStoredCurrentCompanyScope();
  return getCompanyTimeZoneResolutionForScope(
    user,
    master ? storedScope?.id ?? "" : userCompanyId || storedScope?.id || "",
  );
}

/**
 * Resolves timezone metadata only from records whose identity matches the
 * requested company. This prevents a cached/selected timezone from one
 * tenant being paired with another tenant's explicit API scope.
 */
export function getCompanyTimeZoneResolutionForScope(
  user: CurrentUser | null,
  companyScopeId: string | null | undefined,
): CompanyTimeZoneResolution {
  const cleanCompanyScopeId = companyScopeId?.trim() ?? "";
  const master = isMasterUser(user);
  const userCompanyId = getCurrentUserCompanyId(user);
  const storedScope = master
    ? getStoredMasterCompanyScope()
    : getStoredCurrentCompanyScope();
  const cachedCompany = readCachedCompany(cleanCompanyScopeId);
  const scopeBelongsToAuthenticatedContext = Boolean(
    cleanCompanyScopeId &&
      (master
        ? storedScope?.id === cleanCompanyScopeId
        : userCompanyId === cleanCompanyScopeId),
  );
  const candidates: CompanyTimeZoneCandidate[] = master
    ? [
          {
            source: "current-user-company",
            value:
              userCompanyId === cleanCompanyScopeId
                ? user?.company?.timezone
                : undefined,
          },
          {
            source: "current-user-company",
            value:
              userCompanyId === cleanCompanyScopeId
                ? user?.company_timezone
                : undefined,
          },
          {
            source: "selected-company",
            value:
              storedScope?.id === cleanCompanyScopeId
                ? storedScope.timezone
                : undefined,
          },
          {
            source: "company-cache",
            value: scopeBelongsToAuthenticatedContext
              ? cachedCompany?.timezone
              : undefined,
          },
      ]
    : [
          {
            source: "current-user-company",
            value:
              userCompanyId === cleanCompanyScopeId
                ? user?.company?.timezone
                : undefined,
          },
          {
            source: "current-user-company",
            value:
              userCompanyId === cleanCompanyScopeId
                ? user?.company_timezone
                : undefined,
          },
          {
            source: "current-company-scope",
            value:
              scopeBelongsToAuthenticatedContext &&
              storedScope?.id === cleanCompanyScopeId
                ? storedScope?.timezone
                : undefined,
          },
          {
            source: "company-cache",
            value: scopeBelongsToAuthenticatedContext
              ? cachedCompany?.timezone
              : undefined,
          },
      ];

  return resolveCompanyTimeZone([
    ...candidates,
    {
      // Swagger's `/auth/me` does not expose timezone and the only company
      // detail route is super-admin-only. The deployment policy therefore
      // completes only the exact authenticated/selected tenant. It never
      // certifies an empty or divergent company scope.
      source: "deployment-default",
      value: scopeBelongsToAuthenticatedContext
        ? DEFAULT_COMPANY_TIME_ZONE
        : undefined,
    },
  ]);
}

/**
 * An explicit company in a video-wall URL is accepted only while it remains
 * the effective authenticated scope and has timezone metadata tied to that
 * same company, including the explicit deployment policy. Browser timezone is
 * deliberately never accepted as a fallback in this path.
 */
export function certifyCompanyScopeTimeZoneOverride(
  user: CurrentUser | null,
  companyIdOverride: string | null | undefined,
): CompanyScopeTimeZoneCertification {
  const companyScopeId = companyIdOverride?.trim() ?? "";
  const effectiveCompanyScopeId = getEffectiveCompanyScopeId(user);

  if (!companyScopeId || companyScopeId !== effectiveCompanyScopeId) {
    return {
      companyScopeId,
      error: "Empresa do video wall não corresponde à empresa ativa.",
    };
  }

  const resolution = getCompanyTimeZoneResolutionForScope(
    user,
    companyScopeId,
  );
  if (resolution.fallback) {
    return {
      companyScopeId,
      error: "Fuso da empresa do video wall não certificado.",
    };
  }

  return {
    companyScopeId,
    timeZone: resolution.timeZone,
  };
}

export function getEffectiveCompanyTimeZone(user: CurrentUser | null) {
  return getEffectiveCompanyTimeZoneResolution(user).timeZone;
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

export function useEffectiveCompanyTimeZoneResolution(
  user: CurrentUser | null,
) {
  const [resolution, setResolution] = React.useState(() =>
    getEffectiveCompanyTimeZoneResolution(user),
  );

  React.useEffect(() => {
    function syncTimeZone() {
      setResolution(getEffectiveCompanyTimeZoneResolution(user));
    }

    syncTimeZone();
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncTimeZone);
    window.addEventListener(COMPANY_CACHE_EVENT, syncTimeZone);
    window.addEventListener("storage", syncTimeZone);

    return () => {
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncTimeZone);
      window.removeEventListener(COMPANY_CACHE_EVENT, syncTimeZone);
      window.removeEventListener("storage", syncTimeZone);
    };
  }, [user]);

  return resolution;
}

export function useEffectiveCompanyTimeZone(user: CurrentUser | null) {
  return useEffectiveCompanyTimeZoneResolution(user).timeZone;
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

/**
 * Lists the compatible keys for a setting that became progressively more
 * specific. The current view always wins, followed only by values belonging
 * to the same user/company scope and, finally, the two historical
 * company-wide key formats.
 */
export function getUserViewScopedStorageReadKeys(
  baseKey: string,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const cleanCompanyId = companyId?.trim() ?? "";
  const cleanUserId = userId?.trim() ?? "";
  const cleanViewId = viewId?.trim() ?? "";
  const keys = [
    getUserViewScopedStorageKey(
      baseKey,
      cleanCompanyId,
      cleanUserId,
      cleanViewId,
    ),
  ];

  if (cleanViewId) {
    keys.push(
      getUserViewScopedStorageKey(baseKey, cleanCompanyId, cleanUserId),
    );
  }

  if (cleanCompanyId && (cleanUserId || cleanViewId)) {
    keys.push(getUserViewScopedStorageKey(baseKey, cleanCompanyId));
  }

  if (cleanCompanyId) {
    keys.push(getScopedStorageKey(baseKey, cleanCompanyId));
  }

  return Array.from(new Set(keys));
}

export function readUserViewScopedStorageEntry(
  baseKey: string,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (typeof window === "undefined") return null;

  const personalKey = getUserViewScopedStorageKey(
    baseKey,
    companyId,
    userId,
    viewId,
  );
  const personalBaseKey = getUserViewScopedStorageKey(
    baseKey,
    companyId,
    userId,
  );
  const legacyFallbackBlocked = Boolean(
    userId?.trim() &&
      (hasUserGridKnownDeletion(personalKey) ||
        hasUserGridKnownDeletion(personalBaseKey)),
  );

  for (const key of getUserViewScopedStorageReadKeys(
    baseKey,
    companyId,
    userId,
    viewId,
  )) {
    const value = window.localStorage.getItem(key);
    if (value === null) continue;

    const alreadyPersonal = Boolean(
      userId?.trim() &&
      (key === personalBaseKey || key.startsWith(`${personalBaseKey}.view.`)),
    );
    if (!alreadyPersonal && legacyFallbackBlocked) continue;
    if (userId?.trim() && !alreadyPersonal && personalKey !== key) {
      writeUserGridPreference(personalKey, value);
      return { key: personalKey, value };
    }
    return { key, value };
  }

  return null;
}

export function getEntityCompanyId(value: unknown) {
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const nestedCompany =
    record.company && typeof record.company === "object"
      ? (record.company as Record<string, unknown>)
      : null;
  for (const companyId of [
    record.company_id,
    record.companyId,
    record.companyID,
    nestedCompany?.id,
  ]) {
    const normalized = toCleanId(companyId);
    if (normalized) return normalized;
  }

  return "";
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

function readStoredCompanyScope(key: string) {
  if (typeof window === "undefined") return null;

  try {
    const rawScope = window.localStorage.getItem(key);
    if (!rawScope) return null;

    const scope = JSON.parse(rawScope) as Partial<MasterCompanyScope>;
    const id = toCleanId(scope?.id);
    const name = toCleanId(scope?.name);
    if (!id || !name) return null;

    return {
      id,
      name,
      timezone: normalizeOptionalString(scope.timezone),
      trade_name: normalizeOptionalString(scope.trade_name),
    };
  } catch {
    return null;
  }
}

function writeStoredCompanyScope(key: string, scope: MasterCompanyScope) {
  if (typeof window === "undefined") return;

  const id = toCleanId(scope.id);
  const name = toCleanId(scope.name);
  if (!id || !name) return;

  window.localStorage.setItem(
    key,
    JSON.stringify({
      id,
      name,
      timezone: normalizeOptionalString(scope.timezone),
      trade_name: normalizeOptionalString(scope.trade_name),
    } satisfies MasterCompanyScope),
  );
  window.dispatchEvent(new Event(MASTER_COMPANY_SCOPE_EVENT));
}

function clearStoredCompanyScope(key: string) {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(key);
  window.dispatchEvent(new Event(MASTER_COMPANY_SCOPE_EVENT));
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
