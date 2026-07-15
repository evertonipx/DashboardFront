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
  const suffix = path.map(encodeURIComponent).join("/");
  const pathname = suffix ? `/swagger/${suffix}` : "/swagger";

  return proxyBackendRequest(request, pathname);
}

export const GET = handler;
export const HEAD = handler;
export const OPTIONS = handler;
