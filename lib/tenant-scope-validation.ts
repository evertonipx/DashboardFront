/**
 * Builds a company-id resolver for a response returned by an authenticated,
 * tenant-scoped request.
 *
 * Passing `expectedCompanyId` is an explicit attestation made by the call site:
 * the request used that effective tenant (JWT for a company user, or the
 * backend-validated company selector for a master user). A response may omit
 * `company_id` in that case, but an explicit conflicting value is never
 * accepted. Without an expectation, the legacy strict contract is preserved.
 */
export function createTenantCompanyIdResolver(
  expectedCompanyId?: string | null,
) {
  const expected = normalizeExpectedCompanyId(expectedCompanyId);

  return (value: unknown, context: string) => {
    if (value === undefined || value === null) {
      if (expected) return expected;
      throw new Error(`A API retornou ${context} inválido ou ausente.`);
    }

    const declared = requireCanonicalCompanyId(value, context);
    if (expected && declared !== expected) {
      throw new Error(
        `A API retornou ${context} "${declared}" fora da empresa autenticada "${expected}".`,
      );
    }

    return declared;
  };
}

export type ExplicitCompanyScopedRows = {
  foreignCompanyIds: string[];
  foreignCount: number;
  rows: unknown[];
};

/**
 * Partitions a collection returned to a Master before validating the tenant's
 * domain fields. Some backend versions return a multi-company catalogue for a
 * Master even when X-Company-ID is present. In that compatibility mode every
 * row must declare a canonical company_id; only rows belonging to the exact
 * selected company are allowed to continue to the resource validator.
 *
 * This deliberately does not rewrite or infer company_id. A row without an
 * explicit tenant cannot be safely associated in the browser and blocks the
 * collection instead of being attributed to the selected company.
 */
export function selectExplicitCompanyScopedRows(
  value: unknown,
  expectedCompanyId: string,
  {
    collectionKeys = [],
    label = "registros",
  }: {
    collectionKeys?: readonly string[];
    label?: string;
  } = {},
): ExplicitCompanyScopedRows {
  const expected = requireCanonicalCompanyId(
    expectedCompanyId,
    "company_id esperado da requisição autenticada",
  );
  const sourceRows = requireCollectionRows(value, collectionKeys, label);
  const rows: unknown[] = [];
  const foreignCompanyIds = new Set<string>();
  let foreignCount = 0;

  sourceRows.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      throw new Error(
        `A API retornou um item inválido na lista de ${label}, posição ${index}.`,
      );
    }

    const companyId = requireCanonicalCompanyId(
      candidate.company_id,
      `company_id de ${label} na posição ${index}`,
    );
    if (companyId === expected) {
      rows.push(candidate);
      return;
    }

    foreignCount += 1;
    foreignCompanyIds.add(companyId);
  });

  return {
    foreignCompanyIds: [...foreignCompanyIds],
    foreignCount,
    rows,
  };
}

function normalizeExpectedCompanyId(value?: string | null) {
  if (value === undefined || value === null) return undefined;
  return requireCanonicalCompanyId(
    value,
    "company_id esperado da requisição autenticada",
  );
}

function requireCanonicalCompanyId(value: unknown, context: string) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim()
  ) {
    throw new Error(`A API retornou ${context} inválido.`);
  }

  return value;
}

function requireCollectionRows(
  value: unknown,
  collectionKeys: readonly string[],
  label: string,
) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value) || !collectionKeys.length) {
    throw new Error(`A API retornou uma lista de ${label} inválida.`);
  }

  const presentKeys = collectionKeys.filter(
    (key) => value[key] !== undefined,
  );
  if (
    presentKeys.length !== 1 ||
    !Array.isArray(value[presentKeys[0]])
  ) {
    throw new Error(
      `A API retornou um envelope ambíguo ou inválido para ${label}.`,
    );
  }

  return value[presentKeys[0]] as unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
