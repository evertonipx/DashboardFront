export type CompanyUserProfile = {
  name: string;
  email: string;
  active: boolean;
};

export type CompanyUserProfileDraft = {
  name: string;
  email: string;
  password: string;
  active: boolean;
};

export type CompanyUserProfileUpdateRequest = {
  name: string;
  email: string;
  is_master: false;
  active: boolean;
  password?: string;
};

export type CompanyUserProfileUpdateOptions = {
  /**
   * A permission-only change must never be promoted to a profile PUT because
   * of a representation difference in the company-scoped listing payload.
   */
  profileTouched?: boolean;
};

export type CompanyUserMutationIdentity = {
  id?: unknown;
  company_id?: unknown;
};

export type CompanyUserMutationIdentityExpectation = {
  companyId: string;
  userId?: string;
};

/**
 * Builds the full PUT body required by the users API only when a profile field
 * really changed. Company-admin access is deliberately absent here: it is
 * represented by the user's permissions and must not trigger a profile PUT.
 */
export function buildCompanyUserProfileUpdate(
  current: CompanyUserProfile,
  draft: CompanyUserProfileDraft,
  { profileTouched = true }: CompanyUserProfileUpdateOptions = {},
): CompanyUserProfileUpdateRequest | null {
  if (!profileTouched) return null;

  const name = draft.name.trim();
  const email = draft.email.trim();
  const passwordChanged = draft.password.length > 0;
  const profileChanged =
    name !== current.name.trim() ||
    email.toLowerCase() !== current.email.trim().toLowerCase() ||
    draft.active !== current.active;

  if (!profileChanged && !passwordChanged) return null;

  return {
    name,
    email,
    is_master: false,
    active: draft.active,
    ...(passwordChanged ? { password: draft.password } : undefined),
  };
}

/**
 * Certifies the identity returned by a company-scoped user mutation before it
 * is reused by the permissions API. The backend may omit company_id from a
 * response, but an explicit foreign company or a different edited user must
 * never redirect the subsequent permission changes.
 */
export function certifyCompanyUserMutationIdentity(
  value: CompanyUserMutationIdentity | null | undefined,
  expectation: CompanyUserMutationIdentityExpectation,
) {
  if (!value) return "";

  const companyId = requireExpectedIdentifier(
    expectation.companyId,
    "empresa esperada",
  );
  const userId = requireReturnedIdentifier(value.id, "ID do usuário");
  const expectedUserId = expectation.userId?.trim() ?? "";

  if (expectedUserId && userId !== expectedUserId) {
    throw new Error(
      `A API retornou o usuário "${userId}" ao editar "${expectedUserId}". Nenhum acesso foi alterado.`,
    );
  }

  if (value.company_id !== undefined && value.company_id !== null) {
    const returnedCompanyId = requireReturnedIdentifier(
      value.company_id,
      "company_id do usuário",
    );
    if (returnedCompanyId !== companyId) {
      throw new Error(
        `A API retornou o usuário "${userId}" fora da empresa selecionada "${companyId}". Nenhum acesso foi alterado.`,
      );
    }
  }

  return userId;
}

function requireExpectedIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} ausente.`);
  return normalized;
}

function requireReturnedIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`A API retornou ${label} inválido.`);
  }
  return value;
}
