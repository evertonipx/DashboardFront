import { NextRequest, NextResponse } from "next/server";

import { resolveBackendBaseUrl } from "@/lib/backend-routing";
import { resolveOccupancySnapshotsProxyResult } from "@/lib/occupancy-snapshots-proxy";

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
  const headers = new Headers({
    Authorization: authorization,
  });
  const companyScopeId = request.headers.get("x-company-id")?.trim();
  if (companyScopeId) {
    headers.set("X-Company-ID", companyScopeId);
  }

  let backendBaseUrl: string;
  try {
    backendBaseUrl = resolveBackendBaseUrl(request);
  } catch {
    return NextResponse.json(
      { error: "O serviço de dados está temporariamente indisponível." },
      { status: 500 },
    );
  }

  const response = await fetchSnapshotResponse(
    `${backendBaseUrl}/api/v1/occupancy?${params}`,
    headers,
    request.signal,
  );
  const result = await resolveOccupancySnapshotsProxyResult(response);

  return NextResponse.json(result.payload, { status: result.status });
}

async function fetchSnapshotResponse(
  url: string,
  headers: Headers,
  sourceSignal: AbortSignal,
) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(sourceSignal.reason);
  if (sourceSignal.aborted) forwardAbort();
  else sourceSignal.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    return await fetch(url, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => null);
  } finally {
    clearTimeout(timeout);
    sourceSignal.removeEventListener("abort", forwardAbort);
  }
}
