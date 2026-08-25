"use client";

import { ApiError, apiFetch } from "@/lib/api";

export type CompanyUserResourceRouteVariant =
  | "global-header"
  | "global-query"
  | "company-path";

export type CompanyUserResourceRoute = {
  companyId: string;
  userId: string;
  variant: CompanyUserResourceRouteVariant;
};

export type CompanyUserResourceRead<T> = {
  route: CompanyUserResourceRoute;
  value: T;
};

export type CompanyUserResourceMutationOptions = {
  body?: unknown;
  method: "DELETE" | "PATCH" | "POST" | "PUT";
};

const ROUTE_VARIANTS: readonly CompanyUserResourceRouteVariant[] = [
  "global-header",
  "global-query",
  "company-path",
];

/**
 * Discovers a compatible user-resource route with read-only requests. A 403 is
 * an authorization decision and is therefore never retried through another
 * route. Only a 404 can advance to the next compatibility form.
 */
export async function discoverCompanyUserResource<T>(
  companyScopeId: string,
  userId: string,
  suffix = "",
): Promise<CompanyUserResourceRead<T>> {
  const identity = requireCompanyUserIdentity(companyScopeId, userId);
  let lastNotFound: ApiError | null = null;

  for (const variant of ROUTE_VARIANTS) {
    const route = { ...identity, variant } satisfies CompanyUserResourceRoute;
    try {
      return {
        route,
        value: await readCompanyUserResourceAtRoute<T>(route, suffix),
      };
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      lastNotFound = error;
    }
  }

  throw (
    lastNotFound ??
    new Error("A API não encontrou uma rota de usuário para a empresa selecionada.")
  );
}

export function readCompanyUserResourceAtRoute<T>(
  route: CompanyUserResourceRoute,
  suffix = "",
) {
  return apiFetch<T>(
    companyUserResourcePath(route, suffix),
    companyUserResourceRequestScope(route),
  );
}

/**
 * Executes exactly one mutation against a route previously certified by a GET.
 * Mutation failures are returned to the caller without probing another URL.
 */
export function mutateCompanyUserResource<T = unknown>(
  route: CompanyUserResourceRoute,
  suffix: string,
  options: CompanyUserResourceMutationOptions,
) {
  return apiFetch<T>(companyUserResourcePath(route, suffix), {
    ...companyUserResourceRequestScope(route),
    ...options,
  });
}

export function companyUserResourcePath(
  route: CompanyUserResourceRoute,
  suffix = "",
) {
  const companyId = encodeURIComponent(route.companyId);
  const userId = encodeURIComponent(route.userId);
  const normalizedSuffix = normalizeResourceSuffix(suffix);

  switch (route.variant) {
    case "global-header":
      return `/users/${userId}${normalizedSuffix}`;
    case "global-query":
      return `/users/${userId}${normalizedSuffix}?company_id=${companyId}`;
    case "company-path":
      return `/companies/${companyId}/users/${userId}${normalizedSuffix}`;
  }
}

function companyUserResourceRequestScope(route: CompanyUserResourceRoute) {
  return route.variant === "company-path"
    ? {
        companyScopeId: route.companyId,
        jwtCompanyScopeOnly: true,
      }
    : { companyScopeId: route.companyId };
}

function requireCompanyUserIdentity(companyScopeId: string, userId: string) {
  const companyId = companyScopeId.trim();
  const cleanUserId = userId.trim();
  if (!companyId || !cleanUserId) {
    throw new Error("Empresa ou usuário ausente para a operação de acesso.");
  }

  return { companyId, userId: cleanUserId };
}

function normalizeResourceSuffix(suffix: string) {
  if (!suffix) return "";
  if (suffix.includes("?") || suffix.includes("#")) {
    throw new Error("Sufixo de recurso de usuário inválido.");
  }
  return suffix.startsWith("/") ? suffix : `/${suffix}`;
}
