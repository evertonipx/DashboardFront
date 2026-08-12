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

/**
 * Builds the full PUT body required by the users API only when a profile field
 * really changed. Company-admin access is deliberately absent here: it is
 * represented by the user's permissions and must not trigger a profile PUT.
 */
export function buildCompanyUserProfileUpdate(
  current: CompanyUserProfile,
  draft: CompanyUserProfileDraft,
): CompanyUserProfileUpdateRequest | null {
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
