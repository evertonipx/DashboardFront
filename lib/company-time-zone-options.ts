import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";

export const PREFERRED_COMPANY_TIME_ZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Recife",
  "America/Fortaleza",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Belem",
  "America/Boa_Vista",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Bahia",
  "America/Maceio",
  "America/Araguaina",
  "America/Santarem",
  "America/Noronha",
  "UTC",
] as const;

const FALLBACK_COMPANY_TIME_ZONES = [
  ...PREFERRED_COMPANY_TIME_ZONES,
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Lima",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Santiago",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
] as const;

const COMPANY_TIME_ZONE_LABELS: Readonly<Record<string, string>> = {
  "America/Araguaina": "Araguaína",
  "America/Bahia": "Bahia",
  "America/Belem": "Belém",
  "America/Boa_Vista": "Boa Vista",
  "America/Campo_Grande": "Campo Grande",
  "America/Cuiaba": "Cuiabá",
  "America/Fortaleza": "Fortaleza",
  "America/Maceio": "Maceió",
  "America/Manaus": "Manaus",
  "America/Noronha": "Fernando de Noronha",
  "America/Porto_Velho": "Porto Velho",
  "America/Recife": "Recife",
  "America/Rio_Branco": "Rio Branco",
  "America/Santarem": "Santarém",
  "America/Sao_Paulo": "Brasília / São Paulo",
  UTC: "UTC",
};

const preferredCompanyTimeZoneSet = new Set<string>(
  PREFERRED_COMPANY_TIME_ZONES,
);

export function isPreferredCompanyTimeZone(timeZone: string) {
  return preferredCompanyTimeZoneSet.has(timeZone);
}

/**
 * Builds a deterministic catalog for the initial server/client render. The
 * browser-supported IANA catalog is supplied only after hydration so differing
 * ICU versions cannot produce a hydration mismatch. A valid existing value is
 * always retained, even when an older runtime omits it from supportedValuesOf.
 */
export function buildCompanyTimeZoneOptions(
  currentValue?: unknown,
  supportedTimeZones: readonly string[] = [],
) {
  const values = new Set<string>();
  for (const candidate of [
    ...FALLBACK_COMPANY_TIME_ZONES,
    ...supportedTimeZones,
    currentValue,
  ]) {
    const timeZone = canonicalCompanyTimeZone(candidate);
    if (timeZone) values.add(timeZone);
  }

  const preferred = PREFERRED_COMPANY_TIME_ZONES.flatMap((candidate) => {
    const timeZone = canonicalCompanyTimeZone(candidate);
    return timeZone && values.has(timeZone) ? [timeZone] : [];
  });
  const preferredSet = new Set(preferred);
  const remaining = [...values]
    .filter((timeZone) => !preferredSet.has(timeZone))
    .sort((left, right) => left.localeCompare(right, "pt-BR"));

  return [...preferred, ...remaining];
}

export function readRuntimeCompanyTimeZones() {
  try {
    return typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  } catch {
    return [];
  }
}

export function companyTimeZoneLabel(timeZone: string) {
  const friendlyLabel = COMPANY_TIME_ZONE_LABELS[timeZone];
  if (friendlyLabel) {
    return friendlyLabel === timeZone
      ? timeZone
      : `${friendlyLabel} — ${timeZone}`;
  }

  const segments = timeZone.split("/");
  const locality = segments
    .slice(1)
    .map((segment) => segment.replaceAll("_", " "))
    .join(" / ");
  return locality ? `${locality} — ${timeZone}` : timeZone;
}
