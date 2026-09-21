import { NextRequest, NextResponse } from "next/server";

import { resolveBackendBaseUrl } from "@/lib/backend-routing";
import { resolveOccupancySnapshotsProxyResult } from "@/lib/occupancy-snapshots-proxy";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const params = documentedOccupancyParams(request.nextUrl.searchParams);
  const from = params.get("from");
  const to = params.get("to");
  if (!isValidOccupancyPeriod(from, to)) {
    return NextResponse.json(
      { error: "Informe um período válido para consultar a ocupação." },
      { status: 400 },
    );
  }
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

function documentedOccupancyParams(source: URLSearchParams) {
  const params = new URLSearchParams();
  ["from", "to", "camera_id", "area", "object_class"].forEach((key) => {
    const value = source.get(key)?.trim();
    if (value) params.set(key, value);
  });
  return params;
}

function isValidOccupancyPeriod(from: string | null, to: string | null) {
  if (from === null || to === null) return false;
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  return Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime < toTime;
}
