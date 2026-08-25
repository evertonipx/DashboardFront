export type CompanyAdminPermissionGrant = {
  id: string;
  module_id?: string;
  slug: string;
};

export type CompanyAdminPermissionOption = {
  module_id?: string;
  slug: string;
  grants: readonly CompanyAdminPermissionGrant[];
  unavailable?: boolean;
};

export type PermissionMutation =
  | "grant"
  | "revoke"
  | "none"
  | "blocked-revoke";

export function enabledPermissionGrantSlugs(
  option: CompanyAdminPermissionOption,
  enabledModuleIds: ReadonlySet<string>,
) {
  if (option.unavailable) return [];

  return Array.from(
    new Set(
      option.grants
        .filter(
          (grant) =>
            Boolean(grant.module_id) &&
            enabledModuleIds.has(grant.module_id!) &&
            (!option.module_id || grant.module_id === option.module_id),
        )
        .map((grant) => grant.slug.trim())
        .filter(Boolean),
    ),
  );
}

export function missingCompanyAdminPermissionSlugs(
  options: readonly CompanyAdminPermissionOption[],
  enabledModuleIds: ReadonlySet<string>,
) {
  return options
    .filter(
      (option) =>
        Boolean(option.module_id) && enabledModuleIds.has(option.module_id!),
    )
    .filter(
      (option) =>
        enabledCompanyAdminGrantSlugs(option, enabledModuleIds).length === 0,
    )
    .map((option) => option.slug);
}

export function enabledCompanyAdminGrantSlugs(
  option: CompanyAdminPermissionOption,
  enabledModuleIds: ReadonlySet<string>,
) {
  return enabledPermissionGrantSlugs(option, enabledModuleIds);
}

export function enabledCompanyAdminOperationalSlugs(
  options: readonly CompanyAdminPermissionOption[],
  enabledModuleIds: ReadonlySet<string>,
) {
  return Array.from(
    new Set(
      options.flatMap((option) =>
        enabledCompanyAdminGrantSlugs(option, enabledModuleIds),
      ),
    ),
  );
}

export function isCertifiedCompanyAdminState(
  state: Readonly<Record<string, boolean>>,
  options: readonly CompanyAdminPermissionOption[],
  enabledModuleIds: ReadonlySet<string>,
) {
  if (missingCompanyAdminPermissionSlugs(options, enabledModuleIds).length) {
    return false;
  }

  const grantableOptions = options.filter(
    (option) => enabledCompanyAdminGrantSlugs(option, enabledModuleIds).length > 0,
  );

  return (
    grantableOptions.length > 0 &&
    grantableOptions.every((option) => Boolean(state[option.slug]))
  );
}

export function resolvePermissionMutation({
  baselineCertified,
  companyAdminPromotion,
  desired,
  option,
  permissionTouched,
  enabledModuleIds,
}: {
  baselineCertified: boolean;
  companyAdminPromotion: boolean;
  desired: boolean;
  option: CompanyAdminPermissionOption;
  permissionTouched: boolean;
  enabledModuleIds: ReadonlySet<string>;
}): PermissionMutation {
  if (!enabledPermissionGrantSlugs(option, enabledModuleIds).length) {
    return "none";
  }

  if (desired) {
    return companyAdminPromotion || permissionTouched ? "grant" : "none";
  }

  if (!permissionTouched || companyAdminPromotion) return "none";
  return baselineCertified ? "revoke" : "blocked-revoke";
}
