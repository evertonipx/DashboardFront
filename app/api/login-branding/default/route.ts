import { NextResponse } from "next/server";

import { readDefaultLoginBranding } from "@/lib/login-branding-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const branding = await readDefaultLoginBranding();
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
