import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { appendServerTiming } from "../lib/backend-routing.ts";

test("proxy solicita compressão no salto até a API e remove metadados da representação", () => {
  const source = readFileSync(
    new URL("../lib/backend-routing.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /UPSTREAM_ACCEPT_ENCODING = "br, gzip"/);
  assert.match(
    source,
    /requestHeaders\.set\("accept-encoding", UPSTREAM_ACCEPT_ENCODING\)/,
  );
  for (const header of ["content-encoding", "content-length", "content-md5", "digest"]) {
    assert.match(source, new RegExp(`(?:delete\\(|HOP_BY_HOP_HEADERS)[\\s\\S]*?${header}`));
  }
});

test("Server-Timing preserva métricas do backend e acrescenta o salto do proxy", () => {
  const headers = new Headers({ "Server-Timing": "postgres;dur=12.4" });
  appendServerTiming(headers, "ipxdata_api", 18.26, "Backend API");
  assert.equal(
    headers.get("server-timing"),
    'postgres;dur=12.4, ipxdata_api;dur=18.3;desc="Backend API"',
  );
});

test("Server-Timing não publica métricas inválidas", () => {
  const headers = new Headers();
  appendServerTiming(headers, "invalid metric", 10, "API");
  appendServerTiming(headers, "api", Number.NaN, "API");
  assert.equal(headers.has("server-timing"), false);
});
