import { NextResponse } from "next/server";

import {
  normalizeLoginBrandingCompanyId,
  readLoginBrandingLogo,
} from "@/lib/login-branding-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ companyId: string }> };

export async function GET(request: Request, context: Context) {
  const companyId = normalizeLoginBrandingCompanyId(
    (await context.params).companyId,
  );
  if (!companyId) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const version = new URL(request.url).searchParams.get("v");
  try {
    const logo = await readLoginBrandingLogo(companyId, version);
    if (!logo) {
      return NextResponse.json(
        { error: "Logo indisponível." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new Response(new Uint8Array(logo.bytes), {
      headers: {
        "Cache-Control": version
          ? "public, max-age=31536000, immutable"
          : "no-store",
        "Content-Length": String(logo.bytes.length),
        "Content-Type": logo.mimeType,
        "Cross-Origin-Resource-Policy": "same-origin",
        ETag: `"${logo.sha256}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar o logo." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
