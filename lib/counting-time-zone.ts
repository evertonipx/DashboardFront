import {
  requireCertifiedCompanyTimeZone,
  requireCompanyTimeZone,
  requireRuntimeCompanyTimeZone,
  type CompanyTimeZoneResolution,
} from "@/lib/company-time-zone";

/**
 * Counting still builds civil calendar ranges with the browser Date API.
 * Until those builders are IANA-aware, only query when the browser and the
 * selected company share the same civil timezone.
 */
export function requireCountingRuntimeTimeZone(timeZone: string) {
  const expected = requireCompanyTimeZone(timeZone);

  try {
    return requireRuntimeCompanyTimeZone(expected);
  } catch {
    throw new Error(
      "O horário deste Worker não corresponde ao da empresa. Atualize a configuração de data e hora.",
    );
  }
}

export function requireCertifiedCountingRuntimeTimeZone(
  resolution: CompanyTimeZoneResolution,
) {
  return requireCountingRuntimeTimeZone(
    requireCertifiedCompanyTimeZone(resolution),
  );
}
