import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_PORT = "8080";
const DEFAULT_BACKEND_PROTOCOL = "http";
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const BODYLESS_STATUSES = new Set([204, 205, 304]);
const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export function resolveBackendBaseUrl(request: NextRequest) {
  const configuredUrl = process.env.IPXDATA_API_URL?.trim();
  if (configuredUrl) return normalizeConfiguredUrl(configuredUrl);

  const protocol = resolveBackendProtocol();
  const port = resolveBackendPort();
  const hostname = formatHostname(resolveRequestHostname(request));

  return `${protocol}://${hostname}:${port}`;
}

export async function proxyBackendRequest(
  request: NextRequest,
  pathname: string,
) {
  let targetUrl: string;

  try {
    targetUrl = `${resolveBackendBaseUrl(request)}${normalizePathname(pathname)}${request.nextUrl.search}`;
  } catch {
    return NextResponse.json(
      { error: "Configuração do backend inválida." },
      { status: 500 },
    );
  }

  const requestHeaders = new Headers(request.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => requestHeaders.delete(header));
  requestHeaders.set("accept-encoding", "identity");
  requestHeaders.set(
    "x-forwarded-host",
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
      request.headers.get("host") ||
      request.nextUrl.host,
  );
  requestHeaders.set(
    "x-forwarded-proto",
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
      request.nextUrl.protocol.replace(/:$/, ""),
  );

  const body = BODYLESS_METHODS.has(request.method)
    ? undefined
    : await request.arrayBuffer();
  const response = await fetch(targetUrl, {
    body,
    cache: "no-store",
    headers: requestHeaders,
    method: request.method,
    redirect: "manual",
  }).catch(() => null);

  if (!response) {
    return NextResponse.json(
      {
        error:
          "Backend indisponível no hostname acessado. Verifique a porta e o protocolo da API.",
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers(response.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => responseHeaders.delete(header));
  responseHeaders.delete("content-encoding");

  return new NextResponse(
    BODYLESS_STATUSES.has(response.status) ? null : response.body,
    {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
    },
  );
}

function normalizeConfiguredUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("IPXDATA_API_URL deve usar HTTP ou HTTPS.");
  }

  return value.replace(/\/+$/, "");
}

function resolveBackendProtocol() {
  const protocol = (
    process.env.IPXDATA_API_PROTOCOL ?? DEFAULT_BACKEND_PROTOCOL
  )
    .trim()
    .toLowerCase()
    .replace(/:$/, "");

  if (protocol !== "http" && protocol !== "https") {
    throw new Error("IPXDATA_API_PROTOCOL deve ser http ou https.");
  }

  return protocol;
}

function resolveBackendPort() {
  const value = (process.env.IPXDATA_API_PORT ?? DEFAULT_BACKEND_PORT).trim();
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("IPXDATA_API_PORT deve ser uma porta válida.");
  }

  return String(port);
}

function resolveRequestHostname(request: NextRequest) {
  const candidates = [
    firstHeaderValue(request.headers.get("x-forwarded-host")),
    request.headers.get("host"),
    request.nextUrl.host,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const hostname = new URL(`http://${candidate}`).hostname;
      if (hostname) return hostname;
    } catch {
      continue;
    }
  }

  return request.nextUrl.hostname || "localhost";
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() ?? "";
}

function formatHostname(hostname: string) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return hostname;
  return hostname.includes(":") ? `[${hostname}]` : hostname;
}

function normalizePathname(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}
