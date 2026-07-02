import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const now = new Date();
  const params = new URLSearchParams({
    from: new Date(now.getTime() - 60 * 60_000).toISOString(),
    to: now.toISOString(),
  });
  const companyId = request.headers.get("x-company-id");
  const headers = new Headers({
    Authorization: authorization,
  });

  if (companyId) {
    headers.set("X-Company-ID", companyId);
  }

  const response = await fetch(`${backendBaseUrl()}/api/v1/occupancy?${params}`, {
    headers,
    cache: "no-store",
  }).catch(() => null);

  if (!response || response.status === 404 || response.status === 405) {
    return NextResponse.json({ data: [] });
  }

  const payload = await response.json().catch(() => ({ data: [] }));
  return NextResponse.json(payload, { status: response.status });
}

function backendBaseUrl() {
  return (process.env.IPXDATA_API_URL ?? "http://192.168.14.6:8080").replace(
    /\/$/,
    "",
  );
}
