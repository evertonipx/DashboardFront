const TECHNICAL_ERROR_MARKERS = [
  /\bapi\b/i,
  /\bbackend\b/i,
  /\bjwt\b/i,
  /\bswagger\b/i,
  /\bendpoint\b/i,
  /\brota\b/i,
  /\bpayload\b/i,
  /\bjson\b/i,
  /\bcontrato\b/i,
  /\biana\b/i,
  /\btime[ _-]?zone\b/i,
  /\bbucket(?:s)?\b/i,
  /\brfc\s*3339\b/i,
  /\b(?:age[ _-]?bucket|count|gender|emotion)\b/i,
  /\blinha demográfica(?:\s+na posição\s+\d+)?\b/i,
  /\bsnapshot\b/i,
  /\bcertificad[oa]s?\b/i,
  /\brequest[ _-]?id\b/i,
  /\bid\b/i,
  /\bidentificador(?:es)?\b/i,
  /\b(?:company|tenant|user|module|worker|camera|location|area|scenario)[ _-]?id\b/i,
  /\b(?:access|refresh)[ _-]?token\b/i,
  /\b(?:http|sql)\b/i,
  /\b(?:forbidden|unauthori[sz]ed|not found|bad gateway|internal server error)\b/i,
  /\b(?:permission denied|access denied|module not enabled|invalid token|token expired)\b/i,
  /\b(?:failed to fetch|fetch failed|network error)\b/i,
  /\b(?:aborterror|aborted without reason|typeerror|referenceerror)\b/i,
  /\bstatus\s+\d{3}\b/i,
  /https?:\/\//i,
  /\b[a-z][a-z0-9_+-]+\/[a-z][a-z0-9_+-]+(?:\/[a-z][a-z0-9_+-]+)?\b/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}\b/i,
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/i,
  /\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?\b/i,
  /\b(?:get|post|put|patch|delete)\s+\/[a-z0-9/_?&=.-]+/i,
  /\/[a-z0-9_-]+\/\{?[a-z0-9_-]+\}?/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /^\s*(?:[<{]|\[)/,
] as const;

/**
 * Keeps implementation and tenant identifiers out of customer-facing errors.
 * Callers provide a short, actionable fallback for technical failures while
 * ordinary validation messages remain useful to the user.
 */
export function userFacingErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  if (TECHNICAL_ERROR_MARKERS.some((marker) => marker.test(message))) {
    return fallback;
  }
  return message;
}
