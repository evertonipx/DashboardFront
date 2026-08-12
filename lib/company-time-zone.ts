export const DEFAULT_COMPANY_TIME_ZONE = "America/Sao_Paulo";

export type CompanyTimeZoneSource =
  | "selected-company"
  | "current-user-company"
  | "current-company-scope"
  | "company-cache"
  | "fallback";

export type CompanyTimeZoneCandidate = {
  source: Exclude<CompanyTimeZoneSource, "fallback">;
  value: unknown;
};

export type CompanyTimeZoneResolution = {
  fallback: boolean;
  source: CompanyTimeZoneSource;
  timeZone: string;
  warning?: string;
};

export type CompanyZonedDateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const zonedPartsFormatters = new Map<string, Intl.DateTimeFormat>();
const dayStartCache = new Map<string, number>();

export function canonicalCompanyTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value.trim(),
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function resolveCompanyTimeZone(
  candidates: readonly CompanyTimeZoneCandidate[],
  fallbackTimeZone = DEFAULT_COMPANY_TIME_ZONE,
): CompanyTimeZoneResolution {
  for (const candidate of candidates) {
    const timeZone = canonicalCompanyTimeZone(candidate.value);
    if (timeZone) {
      return {
        fallback: false,
        source: candidate.source,
        timeZone,
      };
    }
  }

  const fallback = canonicalCompanyTimeZone(fallbackTimeZone);
  if (!fallback) {
    throw new Error("O timezone padrão configurado para as empresas é inválido.");
  }

  const declaredInvalidTimeZone = candidates.some(
    (candidate) =>
      typeof candidate.value === "string" && Boolean(candidate.value.trim()),
  );

  return {
    fallback: true,
    source: "fallback",
    timeZone: fallback,
    warning: declaredInvalidTimeZone
      ? `O timezone informado pela empresa é inválido; usando explicitamente ${fallback}.`
      : `A empresa não informou timezone; usando explicitamente ${fallback}.`,
  };
}

export function companyZonedDateParts(
  date: Date,
  timeZone: string,
): CompanyZonedDateParts {
  requireValidDate(date);
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  let formatter = zonedPartsFormatters.get(canonicalTimeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: canonicalTimeZone,
      year: "numeric",
    });
    zonedPartsFormatters.set(canonicalTimeZone, formatter);
  }

  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const parts = {
    day: values.get("day")!,
    hour: values.get("hour")!,
    minute: values.get("minute")!,
    month: values.get("month")!,
    second: values.get("second")!,
    year: values.get("year")!,
  };

  if (Object.values(parts).some((value) => !Number.isSafeInteger(value))) {
    throw new Error("Não foi possível interpretar o horário civil da empresa.");
  }
  return parts;
}

/**
 * Returns the real instant at which the company's current civil-hour bucket
 * started. Keeping the UTC offset in the bucket identity preserves both
 * occurrences of a repeated DST hour.
 */
export function startOfCompanyTimeZoneHour(date: Date, timeZone: string) {
  requireValidDate(date);
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  let cursor = new Date(
    Math.floor(date.getTime() / 60_000) * 60_000,
  );
  const signature = companyHourSignature(cursor, canonicalTimeZone);

  for (let minute = 0; minute <= 3 * 60; minute += 1) {
    const previous = new Date(cursor.getTime() - 60_000);
    if (companyHourSignature(previous, canonicalTimeZone) !== signature) {
      return cursor;
    }
    cursor = previous;
  }

  throw new Error("Não foi possível localizar o início da hora da empresa.");
}

export function endOfCompanyTimeZoneHour(date: Date, timeZone: string) {
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const start = startOfCompanyTimeZoneHour(date, canonicalTimeZone);
  const signature = companyHourSignature(start, canonicalTimeZone);

  for (let minute = 1; minute <= 3 * 60; minute += 1) {
    const candidate = new Date(start.getTime() + minute * 60_000);
    if (companyHourSignature(candidate, canonicalTimeZone) !== signature) {
      return candidate;
    }
  }

  throw new Error("Não foi possível localizar o fim da hora da empresa.");
}

export function startOfCompanyTimeZoneDay(date: Date, timeZone: string) {
  requireValidDate(date);
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const parts = companyZonedDateParts(date, canonicalTimeZone);
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
  const cacheKey = `${canonicalTimeZone}|${dateKey}`;
  const cached = dayStartCache.get(cacheKey);
  if (cached !== undefined) return new Date(cached);

  let cursor = new Date(
    Math.floor(date.getTime() / 60_000) * 60_000,
  );
  for (let hour = 0; hour <= 27; hour += 1) {
    const previousHour = new Date(cursor.getTime() - 60 * 60_000);
    if (companyDateKey(previousHour, canonicalTimeZone) !== dateKey) {
      for (let minute = 0; minute <= 60; minute += 1) {
        const previousMinute = new Date(cursor.getTime() - 60_000);
        if (companyDateKey(previousMinute, canonicalTimeZone) !== dateKey) {
          dayStartCache.set(cacheKey, cursor.getTime());
          if (dayStartCache.size > 400) dayStartCache.clear();
          return cursor;
        }
        cursor = previousMinute;
      }
      break;
    }
    cursor = previousHour;
  }

  throw new Error("Não foi possível localizar o início do dia da empresa.");
}

export function listCompanyTimeZoneHourBuckets(
  from: Date,
  to: Date,
  timeZone: string,
) {
  requireValidDate(from);
  requireValidDate(to);
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  if (
    from >= to ||
    startOfCompanyTimeZoneHour(from, canonicalTimeZone).getTime() !==
      from.getTime()
  ) {
    throw new RangeError("O intervalo horário da empresa é inválido.");
  }

  const buckets: Date[] = [];
  let cursor = new Date(from);
  while (cursor < to) {
    buckets.push(new Date(cursor));
    cursor = endOfCompanyTimeZoneHour(cursor, canonicalTimeZone);
    if (buckets.length > 31 * 25) {
      throw new RangeError("O intervalo horário da empresa excedeu o limite.");
    }
  }
  if (cursor.getTime() !== to.getTime()) {
    throw new RangeError("O fim do intervalo não coincide com uma hora da empresa.");
  }
  return buckets;
}

/**
 * Calendar aggregates are represented as floating civil dates elsewhere in
 * the dashboard. This creates that representation from the selected company
 * timezone without leaking the browser's calendar into month/year queries.
 */
export function companyCalendarDate(
  date: Date,
  timeZone: string,
  granularity: "day" | "month" | "year",
) {
  const parts = companyZonedDateParts(date, timeZone);
  return new Date(
    parts.year,
    granularity === "year" ? 0 : parts.month - 1,
    granularity === "day" ? parts.day : 1,
  );
}

export function companyTimeZoneHour(date: Date, timeZone: string) {
  return companyZonedDateParts(date, timeZone).hour;
}

export function companyTimeZoneOffsetLabel(date: Date, timeZone: string) {
  requireValidDate(date);
  const canonicalTimeZone = requireCompanyTimeZone(timeZone);
  const offsetMinutes = timeZoneOffsetMinutes(date, canonicalTimeZone);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = absolute % 60;
  return `UTC${sign}${hours}${
    minutes ? `:${String(minutes).padStart(2, "0")}` : ""
  }`;
}

export function formatCompanyDateTime(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "medium",
  },
) {
  requireValidDate(date);
  return new Intl.DateTimeFormat("pt-BR", {
    ...options,
    timeZone: requireCompanyTimeZone(timeZone),
  }).format(date);
}

export function companyDateKey(date: Date, timeZone: string) {
  const parts = companyZonedDateParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

export function requireCompanyTimeZone(value: unknown) {
  const timeZone = canonicalCompanyTimeZone(value);
  if (!timeZone) throw new Error("O timezone da empresa é inválido.");
  return timeZone;
}

export function requireCertifiedCompanyTimeZone(
  resolution: CompanyTimeZoneResolution,
) {
  if (resolution.fallback) {
    throw new Error(
      "Fuso da empresa não certificado. Cadastre um timezone IANA válido antes de consultar dados civis.",
    );
  }
  return requireCompanyTimeZone(resolution.timeZone);
}

export function requireCertifiedRuntimeCompanyTimeZone(
  resolution: CompanyTimeZoneResolution,
) {
  return requireRuntimeCompanyTimeZone(
    requireCertifiedCompanyTimeZone(resolution),
  );
}

/**
 * The current dashboard range builders use the browser's civil calendar.
 * Fail closed when it differs from the selected company so a local date is
 * never silently sent as if it belonged to another timezone.
 */
export function requireRuntimeCompanyTimeZone(timeZone: string) {
  const expected = requireCompanyTimeZone(timeZone);
  const runtime = canonicalCompanyTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  if (!runtime || runtime !== expected) {
    throw new Error(
      `O Dashboard está no fuso "${runtime ?? "desconhecido"}", mas a empresa selecionada usa "${expected}". A consulta civil foi bloqueada para não deslocar horas, dias, meses ou anos.`,
    );
  }
  return expected;
}

function companyHourSignature(date: Date, timeZone: string) {
  const parts = companyZonedDateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}|${timeZoneOffsetMinutes(
    date,
    timeZone,
  )}`;
}

function timeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = companyZonedDateParts(date, timeZone);
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const instantWithoutMilliseconds =
    date.getTime() - date.getMilliseconds();
  return Math.round(
    (wallClockAsUtc - instantWithoutMilliseconds) / 60_000,
  );
}

function requireValidDate(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("O instante usado no timezone da empresa é inválido.");
  }
}
