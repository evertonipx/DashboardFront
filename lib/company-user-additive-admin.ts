"use client";

import { ApiError, apiFetch } from "@/lib/api";

export type AdditiveCompanyAdminGrant = {
  permissionId: string;
  slug: string;
};

export type CompanyUserMembership = {
  id: string;
  company_id: string;
  email?: string;
  is_master?: boolean;
};

export type AdditiveCompanyAdminPromotionInput = {
  companyId: string;
  userId: string;
  expectedEmail?: string;
  grants: readonly AdditiveCompanyAdminGrant[];
};

type CreatedPermission = {
  permissionId: string;
  slug: string;
};

export type CertifiedAdditivePermissionResponse = {
  assignmentId?: string;
  company_id: string;
  permission_id: string;
  slug: string;
  user_id: string;
};

/**
 * Certifies that the exact target still belongs to the selected company.
 * This deliberately requires an explicit company_id in the company-scoped
 * listing: the additive fallback is used precisely when the ordinary user
 * resource cannot be certified, so it must not infer tenant membership.
 */
export function certifyCompanyUserMembership(
  value: unknown,
  {
    companyId: rawCompanyId,
    expectedEmail = "",
    userId: rawUserId,
  }: {
    companyId: string;
    expectedEmail?: string;
    userId: string;
  },
) {
  const companyId = requireIdentifier(rawCompanyId, "empresa selecionada");
  const userId = requireIdentifier(rawUserId, "usuário selecionado");
  if (!Array.isArray(value)) {
    throw new Error(
      "A API não retornou uma lista certificável de usuários da empresa.",
    );
  }

  const matchingRows = value.filter(
    (row): row is Record<string, unknown> =>
      isRecord(row) && row.id === userId,
  );
  if (matchingRows.length !== 1) {
    throw new Error(
      matchingRows.length
        ? "A API retornou o usuário repetido na empresa selecionada."
        : "A API não confirmou que o usuário pertence à empresa selecionada.",
    );
  }

  const row = matchingRows[0];
  if (row.company_id !== companyId) {
    throw new Error(
      "A API não confirmou o company_id exato do usuário na empresa selecionada.",
    );
  }

  const returnedEmail = optionalTrimmedString(row.email, "e-mail do usuário");
  const normalizedExpectedEmail = expectedEmail.trim().toLowerCase();
  if (
    normalizedExpectedEmail &&
    (!returnedEmail || returnedEmail.toLowerCase() !== normalizedExpectedEmail)
  ) {
    throw new Error(
      "A API retornou outro e-mail para o usuário selecionado. Nenhum acesso foi alterado.",
    );
  }
  if (row.is_master === true) {
    throw new Error(
      "O usuário já é super-admin e não pode ser promovido pelo perfil da empresa.",
    );
  }

  return {
    id: userId,
    company_id: companyId,
    ...(returnedEmail ? { email: returnedEmail } : undefined),
    ...(typeof row.is_master === "boolean"
      ? { is_master: row.is_master }
      : undefined),
  } satisfies CompanyUserMembership;
}

/**
 * Reads the documented company-membership route. Call this immediately before
 * an additive promotion; an earlier UI read is only a preview and does not
 * authorize a later mutation.
 */
export async function readCertifiedCompanyUserMembership({
  companyId,
  expectedEmail,
  userId,
}: Omit<AdditiveCompanyAdminPromotionInput, "grants">) {
  const cleanCompanyId = requireIdentifier(companyId, "empresa selecionada");
  const cleanUserId = requireIdentifier(userId, "usuário selecionado");
  const rows = await apiFetch<unknown>(
    `/companies/${encodeURIComponent(cleanCompanyId)}/users`,
    { companyScopeId: cleanCompanyId },
  );
  return certifyCompanyUserMembership(rows, {
    companyId: cleanCompanyId,
    expectedEmail,
    userId: cleanUserId,
  });
}

/**
 * Membership-certified, additive-only fallback for a Master promoting a user
 * when GET /users/{id}/permissions is unavailable for the selected tenant.
 *
 * It intentionally has no profile update, granular grant, ordinary revoke or
 * permission-route discovery. Every POST uses the single documented route and
 * every successful response is certified before the next grant is attempted.
 */
export async function promoteCompanyUserToAdminAdditively({
  companyId,
  expectedEmail,
  grants,
  userId,
}: AdditiveCompanyAdminPromotionInput) {
  const membership = await readCertifiedCompanyUserMembership({
    companyId,
    expectedEmail,
    userId,
  });
  const grantPlan = certifyAdditiveCompanyAdminGrantPlan(grants);
  const createdPermissions: CreatedPermission[] = [];
  const certifiedPermissions: CertifiedAdditivePermissionResponse[] = [];

  try {
    for (const grant of grantPlan) {
      let response: unknown;
      let created = true;
      let conflict = false;
      try {
        response = await apiFetch<unknown>(
          `/users/${encodeURIComponent(membership.id)}/permissions`,
          {
            body: { slug: grant.slug },
            companyScopeId: membership.company_id,
            expectedStatus: 201,
            method: "POST",
            retry: false,
          },
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;

        // A conflict is useful only when the API returns the exact existing
        // assignment. An error-only 409 cannot prove that this user/tenant has
        // the requested grant and therefore fails the whole promotion.
        response = error.payload;
        created = false;
        conflict = true;
      }

      // A successful POST means this attempt may already have created the
      // catalog grant even when the response body is malformed. Record the
      // known catalog permission immediately and never trust a divergent
      // response identifier for rollback.
      if (created) {
        createdPermissions.push({
          permissionId: grant.permissionId,
          slug: grant.slug,
        });
      }

      let permission: CertifiedAdditivePermissionResponse;
      try {
        permission = certifyAdditivePermissionResponse(response, {
          companyId: membership.company_id,
          permissionId: grant.permissionId,
          slug: grant.slug,
          userId: membership.id,
        });
      } catch (error) {
        if (!conflict) throw error;
        throw new Error(
          "A API respondeu 409 sem retornar uma permissão certificada para o usuário e a empresa selecionados.",
        );
      }
      certifiedPermissions.push(permission);
    }
  } catch (error) {
    const rollbackFailures = await rollbackCreatedPermissions(
      membership.company_id,
      membership.id,
      createdPermissions,
    );
    const detail =
      error instanceof Error
          ? error.message
          : "A API não concluiu a promoção aditiva.";

    if (rollbackFailures.length) {
      throw new Error(
        `${detail} A reversão também falhou para: ${rollbackFailures.join(", ")}.`,
      );
    }
    throw new Error(
      createdPermissions.length
        ? `${detail} As permissões criadas nesta tentativa foram revertidas.`
        : detail,
    );
  }

  return certifiedPermissions;
}

export function certifyAdditiveCompanyAdminGrantPlan(
  grants: readonly AdditiveCompanyAdminGrant[],
) {
  if (!grants.length) {
    throw new Error(
      "Nenhuma permissão operacional habilitada está disponível para a promoção.",
    );
  }

  const bySlug = new Map<string, AdditiveCompanyAdminGrant>();
  for (const grant of grants) {
    const slug = requireIdentifier(grant.slug, "slug da permissão");
    const permissionId = requireIdentifier(
      grant.permissionId,
      `permission_id de ${slug}`,
    );
    const current = bySlug.get(slug);
    if (current && current.permissionId !== permissionId) {
      throw new Error(
        `O catálogo retornou mais de um permission_id para o slug "${slug}".`,
      );
    }
    bySlug.set(slug, { permissionId, slug });
  }
  return [...bySlug.values()];
}

export function certifyAdditivePermissionResponse(
  value: unknown,
  expectation: {
    companyId: string;
    permissionId: string;
    slug: string;
    userId: string;
  },
) {
  if (!isRecord(value)) {
    throw new Error(
      `A API não retornou UserPermissionResponse certificável para "${expectation.slug}".`,
    );
  }

  const userId = requireExactResponseIdentifier(
    value.user_id,
    expectation.userId,
    "user_id",
  );
  const companyId = requireExactResponseIdentifier(
    value.company_id,
    expectation.companyId,
    "company_id",
  );
  const slug = requireExactResponseIdentifier(
    value.slug,
    expectation.slug,
    "slug",
  );
  const permissionId = requireExactResponseIdentifier(
    value.permission_id,
    expectation.permissionId,
    "permission_id",
  );

  return {
    ...(typeof value.id === "string" && value.id.trim()
      ? { assignmentId: value.id.trim() }
      : undefined),
    company_id: companyId,
    permission_id: permissionId,
    slug,
    user_id: userId,
  } satisfies CertifiedAdditivePermissionResponse;
}

async function rollbackCreatedPermissions(
  companyId: string,
  userId: string,
  createdPermissions: readonly CreatedPermission[],
) {
  const failures: string[] = [];
  for (const permission of [...createdPermissions].reverse()) {
    try {
      await apiFetch(
        `/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(
          permission.permissionId,
        )}`,
        { companyScopeId: companyId, method: "DELETE", retry: false },
      );
    } catch {
      failures.push(permission.slug);
    }
  }
  return failures;
}

function requireExactResponseIdentifier(
  value: unknown,
  expectedValue: string,
  label: string,
) {
  const expected = requireIdentifier(expectedValue, `${label} esperado`);
  if (typeof value !== "string" || value !== expected) {
    throw new Error(
      `A API retornou ${label} divergente ao conceder a permissão.`,
    );
  }
  return value;
}

function requireIdentifier(value: string, label: string) {
  if (!value || value !== value.trim()) {
    throw new Error(`${label} ausente ou inválido.`);
  }
  return value;
}

function optionalTrimmedString(value: unknown, label: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`A API retornou ${label} inválido.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
