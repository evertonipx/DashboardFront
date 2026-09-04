import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function notAvailable() {
  return new NextResponse(null, { status: 404 });
}

export const GET = notAvailable;
export const HEAD = notAvailable;
export const OPTIONS = notAvailable;
