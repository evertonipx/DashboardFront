"use client";

import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import type { CurrentUserCompany } from "@/lib/types";

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
] as const;

type CompanyCache = Record<string, CurrentUserCompany>;

export function readCachedCompany(companyId: string | undefined) {
  if (!companyId || typeof window === "undefined") return null;

  return readCompanyCache()[companyId] ?? null;
}

export function resolveCompanyRecordTimeZone(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { declared: false, timeZone: null } as const;
  }

  const record = value as Record<string, unknown>;
  let declared = false;
  for (const field of COMPANY_TIME_ZONE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    declared = true;
    const timeZone = canonicalCompanyTimeZone(record[field]);
    if (timeZone) return { declared: true, timeZone } as const;
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
