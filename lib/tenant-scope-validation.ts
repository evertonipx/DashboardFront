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
