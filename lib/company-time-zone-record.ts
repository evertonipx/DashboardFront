import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import type { CurrentUser, CurrentUserCompany } from "@/lib/types";

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

type CompanyRecordTimeZoneResolution = {
  declared: boolean;
  timeZone: string | null;
};

export function resolveCompanyRecordTimeZone(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { declared: false, timeZone: null } as const;
  }

  return resolveCompanyRecordTimeZoneFields(
    value as Record<string, unknown>,
  );
}

/**
 * Resolves company timezone metadata from an authenticated user profile.
 * This module deliberately has no `use client` boundary because JWT
 * reconciliation runs in both the browser and authenticated Route Handlers.
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

function resolveCompanyRecordTimeZoneFields(
  record: Record<string, unknown>,
): CompanyRecordTimeZoneResolution {
  let declared = false;
  for (const field of COMPANY_TIME_ZONE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    declared = true;
    const timeZone = canonicalCompanyTimeZone(record[field]);
    if (timeZone) return { declared: true, timeZone };
  }

  for (const field of ["settings", "metadata"] as const) {
    const nested = record[field];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const resolution = resolveCompanyRecordTimeZoneFields(
      nested as Record<string, unknown>,
    );
    if (resolution.declared) return resolution;
  }

  return { declared, timeZone: null };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
