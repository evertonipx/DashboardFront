import { NextResponse } from "next/server";

import {
  normalizeLoginBrandingCompanyId,
  readLoginBranding,
} from "@/lib/login-branding-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ companyId: string }> };

export async function GET(_request: Request, context: Context) {
  const companyId = normalizeLoginBrandingCompanyId(
    (await context.params).companyId,
  );
  if (!companyId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  try {
    const branding = await readLoginBranding(companyId);
    if (!branding) {
      return NextResponse.json(
        { error: "Identidade visual indisponível." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(branding, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar a identidade visual." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
