import { NextRequest } from "next/server";

import { proxyBackendRequest } from "@/lib/backend-routing";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const pathname = `/api/v1/${path.map(encodeURIComponent).join("/")}`.replace(
    /\/$/,
    "",
  );

  return proxyBackendRequest(request, pathname || "/api/v1");
}

export const DELETE = handler;
export const GET = handler;
export const HEAD = handler;
export const OPTIONS = handler;
export const PATCH = handler;
export const POST = handler;
export const PUT = handler;
