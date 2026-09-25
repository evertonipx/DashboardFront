import { NextRequest, NextResponse } from "next/server";

import { reconcileCurrentUserWithAccessToken } from "@/lib/access-token-claims";
import {
  normalizeLoginBrandingCompanyId,
  removeLoginBranding,
  saveLoginBranding,
} from "@/lib/login-branding-store";
import type { CurrentUser } from "@/lib/types";
import { isMasterUser } from "@/lib/user-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ companyId: string }> };

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest, context: Context) {
  const companyId = normalizeLoginBrandingCompanyId(
    (await context.params).companyId,
  );
  if (!companyId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }
  const session = await authenticateMaster(request);
  if ("response" in session) return session.response;

  const companyResponse = await fetchBackend(
    session.baseUrl,
    `/api/v1/companies/${companyId}`,
    session.authorization,
    request.signal,
    companyId,
    "application/json",
  );
  if (!companyResponse) return unavailable();
  if (companyResponse.status === 404) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  if (companyResponse.status === 401 || companyResponse.status === 403) return forbidden();
  if (!companyResponse.ok) return unavailable();

  const rawCompany = await companyResponse.json().catch(() => null);
  const company = unwrapCompany(rawCompany);
  if (!company || typeof company.id !== "string" ||
      normalizeLoginBrandingCompanyId(company.id) !== companyId) {
    return unavailable();
  }
  const companyName = nonemptyString(company.trade_name) || nonemptyString(company.name);
  if (!companyName) return unavailable();

  const logoResponse = await fetchBackend(
    session.baseUrl,
    `/api/v1/companies/${companyId}/logo`,
    session.authorization,
    request.signal,
    companyId,
    "image/png,image/jpeg,image/gif,image/webp",
  );
  if (!logoResponse) return unavailable();
  let logo: { bytes: Buffer; contentType: string } | null = null;
  if (logoResponse.status !== 404 && logoResponse.status !== 204) {
    if (logoResponse.status === 401 || logoResponse.status === 403) return forbidden();
    if (!logoResponse.ok) return unavailable();
    const contentLength = Number(logoResponse.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_LOGO_BYTES) return unavailable();
    const bytes = await readLimitedBody(logoResponse, MAX_LOGO_BYTES).catch(() => null);
    if (!bytes) return unavailable();
    logo = {
      bytes,
      contentType: logoResponse.headers.get("content-type") ?? "",
    };
  } else if (nonemptyString(company.logo_url)) {
    // An advertised logo that cannot be downloaded is an upstream mismatch,
    // not an intentional removal. Keep the previous public mirror intact.
    return unavailable();
  }

  try {
    const branding = await saveLoginBranding(
      { companyId, companyName, logo },
      undefined,
      { makeDefault: Boolean(logo) },
    );
    return NextResponse.json(branding, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return unavailable();
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const companyId = normalizeLoginBrandingCompanyId(
    (await context.params).companyId,
  );
  if (!companyId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }
  const session = await authenticateMaster(request);
  if ("response" in session) return session.response;
  try {
    await removeLoginBranding(companyId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable();
  }
}

async function authenticateMaster(request: NextRequest): Promise<
  | { baseUrl: string; authorization: string }
  | { response: NextResponse }
> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }
  const baseUrl = configuredBackendBaseUrl();
  if (!baseUrl) return { response: unavailable() };
  const authorization = `Bearer ${token}`;
  const response = await fetchBackend(
    baseUrl,
    "/api/v1/auth/me",
    authorization,
    request.signal,
    null,
    "application/json",
  );
  if (!response) return { response: unavailable() };
  if (response.status === 401) {
    return { response: NextResponse.json({ error: "Sessão inválida." }, { status: 401 }) };
  }
  if (!response.ok) return { response: response.status === 403 ? forbidden() : unavailable() };

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      typeof payload.id !== "string" || !payload.id.trim()) {
    return { response: unavailable() };
  }
  // /auth/me validated this exact token upstream. The backend can omit the
  // master role in its response while carrying it in the same accepted JWT.
  const user = reconcileCurrentUserWithAccessToken(payload as CurrentUser, token);
  if (!user || !isMasterUser(user)) return { response: forbidden() };
  return { baseUrl, authorization };
}

function configuredBackendBaseUrl() {
  const configured = process.env.IPXDATA_API_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if ((url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function fetchBackend(
  baseUrl: string,
  pathname: string,
  authorization: string,
  requestSignal: AbortSignal,
  companyId: string | null,
  accept: string,
) {
  const headers = new Headers({ Authorization: authorization, Accept: accept });
  if (companyId) headers.set("X-Company-ID", companyId);
  return fetch(new URL(pathname, baseUrl), {
    cache: "no-store",
    headers,
    redirect: "error",
    signal: AbortSignal.any([requestSignal, AbortSignal.timeout(15_000)]),
  }).catch(() => null);
}

async function readLimitedBody(response: Response, limit: number) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > limit) throw new Error("Logo muito grande.");
      chunks.push(Buffer.from(result.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, length);
}

function unwrapCompany(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data
    : record;
  return candidate as Record<string, unknown>;
}

function nonemptyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function forbidden() {
  return NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 });
}

function unavailable() {
  return NextResponse.json(
    { error: "Não foi possível sincronizar a identidade visual." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
