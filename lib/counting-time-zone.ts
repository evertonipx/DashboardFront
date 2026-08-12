import {
  canonicalCompanyTimeZone,
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
    const runtime = canonicalCompanyTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    throw new Error(
      `Fuso incompatível: navegador ${runtime ?? "desconhecido"}; empresa ${expected}. Ajuste o navegador.`,
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
