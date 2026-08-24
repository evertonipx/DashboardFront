"use client";

import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import type { CurrentUser, CurrentUserCompany } from "@/lib/types";

const COMPANY_CACHE_KEY = "ipxdata-company-cache-v1";
export const COMPANY_CACHE_EVENT = "ipxdata:company-cache";

const COMPANY_TIME_ZONE_FIELDS = [
  "timezone",
  "company_timezone",
  "companyTimezone",
  "company_time_zone",
  "companyTimeZone",
  "tenant_timezone",
  "tenantTimezone",
  "time_zone",
  "timeZone",
  "tz",
] as const;

const COMPANY_SPECIFIC_TIME_ZONE_FIELDS = [
  "company_timezone",
  "companyTimezone",
  "company_time_zone",
  "companyTimeZone",
] as const;
const TENANT_SPECIFIC_TIME_ZONE_FIELDS = [
  "tenant_timezone",
  "tenantTimezone",
] as const;
const GENERIC_TIME_ZONE_FIELDS = [
  "timezone",
  "time_zone",
  "timeZone",
  "tz",
] as const;

type CompanyCache = Record<string, CurrentUserCompany>;
type CompanyRecordTimeZoneResolution = {
  declared: boolean;
  timeZone: string | null;
};

export function readCachedCompany(companyId: string | undefined) {
  if (!companyId || typeof window === "undefined") return null;

  return readCompanyCache()[companyId] ?? null;
}

export function resolveCompanyRecordTimeZone(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { declared: false, timeZone: null } as const;
  }

  const record = value as Record<string, unknown>;
  return resolveCompanyRecordTimeZoneFields(record);
}

/**
 * Resolves company timezone metadata from an authenticated user profile.
 * Company-specific fields are intentionally evaluated before generic aliases:
 * `/auth/me` is authoritative and a complementary JWT must never overwrite a
 * valid timezone that the API returned under a migration alias.
 */
export function resolveCurrentUserCompanyTimeZone(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { declared: false, timeZone: null } as const;
  }
  const record = value as Record<string, unknown>;

  const companySpecific = resolveCompanyRecordTimeZoneFieldGroup(
    record,
    COMPANY_SPECIFIC_TIME_ZONE_FIELDS,
  );
  if (companySpecific.declared) return companySpecific;

  const nestedCompany = resolveCompanyRecordTimeZone(record.company);
  if (nestedCompany.declared) return nestedCompany;

  const tenantSpecific = resolveCompanyRecordTimeZoneFieldGroup(
    record,
    TENANT_SPECIFIC_TIME_ZONE_FIELDS,
  );
  if (tenantSpecific.declared) return tenantSpecific;

  const nestedTenant = resolveCompanyRecordTimeZone(record.tenant);
  if (nestedTenant.declared) return nestedTenant;

  for (const field of ["settings", "metadata"] as const) {
    const nestedMetadata = resolveCompanyRecordTimeZone(record[field]);
    if (nestedMetadata.declared) return nestedMetadata;
  }

  return resolveCompanyRecordTimeZoneFieldGroup(
    record,
    GENERIC_TIME_ZONE_FIELDS,
  );
}

export function buildCurrentUserCompanyCacheRecord(
  user: CurrentUser,
): CurrentUserCompany | null {
  const companyId = cleanString(user.company_id) || cleanString(user.company?.id);
  const companyName =
    cleanString(user.company?.name) || cleanString(user.company_name);
  const timeZone = resolveCurrentUserCompanyTimeZone(user).timeZone;
  if (!companyId || (!companyName && !timeZone)) return null;

  return {
    ...user.company,
    id: companyId,
    // `/auth/me` omits the company name today. The ID is a stable placeholder
    // that lets the same-tenant IANA certification survive token rotation.
    name: companyName || companyId,
    timezone: timeZone,
    trade_name:
      user.company?.trade_name ?? user.company_trade_name ?? null,
  };
}

function resolveCompanyRecordTimeZoneFieldGroup(
  record: Record<string, unknown>,
  fields: readonly string[],
): CompanyRecordTimeZoneResolution {
  let declared = false;
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    declared = true;
    const timeZone = canonicalCompanyTimeZone(record[field]);
    if (timeZone) return { declared: true, timeZone };
  }
  return { declared, timeZone: null };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveCompanyRecordTimeZoneFields(
  record: Record<string, unknown>,
): CompanyRecordTimeZoneResolution {
  let declared = false;
  for (const field of COMPANY_TIME_ZONE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    declared = true;
    const timeZone = canonicalCompanyTimeZone(record[field]);
    if (timeZone) return { declared: true, timeZone } as const;
  }

  for (const field of ["settings", "metadata"] as const) {
    const nested = record[field];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const resolution = resolveCompanyRecordTimeZoneFields(
      nested as Record<string, unknown>,
    );
    if (resolution.declared) return resolution;
  }

  return { declared, timeZone: null } as const;
}

export function normalizeCompanyRecord<T extends CurrentUserCompany>(company: T) {
  const resolution = resolveCompanyRecordTimeZone(company);
  if (!resolution.declared) return company;
  return { ...company, timezone: resolution.timeZone };
}

export function writeCompanyCache(companies: CurrentUserCompany[]) {
  if (typeof window === "undefined") return;

  const validCompanies = companies.filter(
    (company) => company.id && company.name,
  );
  if (!validCompanies.length) return;

  const cache = readCompanyCache();

  for (const company of validCompanies) {
    const cached = cache[company.id];
    const timeZoneResolution = resolveCompanyRecordTimeZone(company);
    const timezone = timeZoneResolution.declared
      ? timeZoneResolution.timeZone
      : cached?.timezone;
    cache[company.id] = {
      id: company.id,
      name: company.name,
      timezone,
      trade_name: company.trade_name ?? null,
    };
  }

  const serializedCache = JSON.stringify(cache);
  if (window.localStorage.getItem(COMPANY_CACHE_KEY) === serializedCache) return;
  window.localStorage.setItem(COMPANY_CACHE_KEY, serializedCache);
  window.dispatchEvent(new Event(COMPANY_CACHE_EVENT));
}

function readCompanyCache(): CompanyCache {
  if (typeof window === "undefined") return {};

  try {
    const rawCache = window.localStorage.getItem(COMPANY_CACHE_KEY);
    if (!rawCache) return {};

    const parsed = JSON.parse(rawCache) as CompanyCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
