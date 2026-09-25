"use client";

import { apiFetch } from "@/lib/api";

export const COMPANY_BRANDING_MAX_BYTES = 5 * 1024 * 1024;
export const COMPANY_BRANDING_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp";

const supportedCompanyBrandingMimeTypes = new Set(
  COMPANY_BRANDING_ACCEPT.split(","),
);

export type CompanyBrandingKind = "logo" | "banner";

export type CompanyBrandingResponse = {
  company_id?: string;
  kind?: string;
  path?: string;
  url?: string;
};

type CompanyBrandingFileDescriptor = Pick<File, "size" | "type">;

export function companyBrandingLabel(kind: CompanyBrandingKind) {
  return kind === "logo" ? "logo" : "banner";
}

export function companyBrandingFileError(
  file: CompanyBrandingFileDescriptor,
  kind: CompanyBrandingKind,
) {
  const label = companyBrandingLabel(kind);
  if (!file.size) {
    return `O arquivo do ${label} está vazio.`;
  }
  if (file.size > COMPANY_BRANDING_MAX_BYTES) {
    return `O ${label} deve ter no máximo 5 MB.`;
  }
  if (!supportedCompanyBrandingMimeTypes.has(file.type.toLowerCase())) {
    return `Use PNG, JPEG, GIF ou WebP no ${label}.`;
  }
  return null;
}

export function companyBrandingPath(
  companyId: string,
  kind: CompanyBrandingKind,
) {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    throw new Error("A empresa precisa estar salva antes de enviar a imagem.");
  }
  return `/companies/${encodeURIComponent(normalizedCompanyId)}/${kind}`;
}

export function requireCompanyBrandingResponse(
  value: unknown,
  expectedCompanyId: string,
  expectedKind: CompanyBrandingKind,
): CompanyBrandingResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A confirmação da identidade visual é inválida.");
  }

  const record = value as Record<string, unknown>;
  const companyId = optionalResponseString(record.company_id);
  const kind = optionalResponseString(record.kind)?.toLocaleLowerCase("en-US");
  const path = optionalResponseString(record.path);
  const url = optionalResponseString(record.url);

  // Swagger does not mark BrandingResponse fields as required. The scoped
  // route and successful status certify the mutation; when identity fields are
  // present, additionally reject any cross-company or wrong-kind response.
  if (companyId && companyId !== expectedCompanyId.trim()) {
    throw new Error("A imagem retornada pertence a outra empresa.");
  }
  if (kind && kind !== expectedKind) {
    throw new Error("A imagem retornada não corresponde ao tipo enviado.");
  }

  return {
    ...(companyId ? { company_id: companyId } : {}),
    ...(kind ? { kind } : {}),
    ...(path ? { path } : {}),
    ...(url ? { url } : {}),
  };
}

export async function uploadCompanyBranding({
  companyId,
  file,
  kind,
}: {
  companyId: string;
  file: File;
  kind: CompanyBrandingKind;
}) {
  const validationError = companyBrandingFileError(file, kind);
  if (validationError) throw new Error(validationError);

  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await apiFetch<unknown>(companyBrandingPath(companyId, kind), {
    body: formData,
    companyScopeId: companyId,
    method: "POST",
  });

  return requireCompanyBrandingResponse(response, companyId, kind);
}

export async function fetchCompanyBrandingBlob({
  companyId,
  kind,
  signal,
}: {
  companyId: string;
  kind: CompanyBrandingKind;
  signal?: AbortSignal;
}) {
  const response = await apiFetch<Blob>(companyBrandingPath(companyId, kind), {
    companyScopeId: companyId,
    dedupe: false,
    responseType: "blob",
    signal,
  });

  if (!(response instanceof Blob) || !response.size) {
    throw new Error("A imagem cadastrada está vazia ou inválida.");
  }
  const responseMimeType = response.type.split(";", 1)[0]?.trim().toLowerCase();
  if (
    !responseMimeType ||
    !supportedCompanyBrandingMimeTypes.has(responseMimeType)
  ) {
    throw new Error("A imagem cadastrada possui um formato incompatível.");
  }
  return response;
}

function optionalResponseString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
