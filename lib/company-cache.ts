"use client";

import type { CurrentUserCompany } from "@/lib/types";

const COMPANY_CACHE_KEY = "ipxdata-company-cache-v1";

type CompanyCache = Record<string, CurrentUserCompany>;

export function readCachedCompany(companyId: string | undefined) {
  if (!companyId || typeof window === "undefined") return null;

  return readCompanyCache()[companyId] ?? null;
}

export function writeCompanyCache(companies: CurrentUserCompany[]) {
  if (typeof window === "undefined") return;

  const validCompanies = companies.filter(
    (company) => company.id && company.name,
  );
  if (!validCompanies.length) return;

  const cache = readCompanyCache();

  for (const company of validCompanies) {
    cache[company.id] = {
      id: company.id,
      name: company.name,
      trade_name: company.trade_name ?? null,
    };
  }

  window.localStorage.setItem(COMPANY_CACHE_KEY, JSON.stringify(cache));
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
