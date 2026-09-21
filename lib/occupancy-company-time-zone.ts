import {
  requireCertifiedCompanyTimeZone,
  type CompanyTimeZoneResolution,
} from "@/lib/company-time-zone";

/**
 * Occupancy requests are tied to civil hours and dates. A deployment-wide
 * display default is therefore never sufficient authority for a transport
 * query, even when it is a valid IANA timezone.
 */
export function isCertifiedOccupancyCompanyTimeZone(
  resolution: CompanyTimeZoneResolution,
) {
  return (
    !resolution.fallback && resolution.source !== "deployment-default"
  );
}

export function requireCertifiedOccupancyCompanyTimeZone(
  resolution: CompanyTimeZoneResolution,
) {
  if (!isCertifiedOccupancyCompanyTimeZone(resolution)) {
    throw new Error(
      "Fuso horário da empresa indisponível. Revise as configurações da empresa antes de consultar a Ocupação.",
    );
  }
  return requireCertifiedCompanyTimeZone(resolution);
}
