import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GET as getDefaultPublicBranding } from "../app/api/login-branding/default/route.ts";
import { GET as getPublicBranding } from "../app/api/login-branding/[companyId]/route.ts";
import { GET as getPublicLogo } from "../app/api/login-branding/[companyId]/logo/route.ts";
import {
  DELETE as deleteBrandingSync,
  POST as postBrandingSync,
} from "../app/api/login-branding/[companyId]/sync/route.ts";

import {
  normalizeLoginBrandingCompanyId,
  readDefaultLoginBranding,
  readLoginBranding,
  readLoginBrandingLogo,
  removeLoginBranding,
  saveLoginBranding,
  validateLoginBrandingLogo,
} from "../lib/login-branding-store.ts";

const COMPANY_ID = "39ec2409-ed74-42b7-96ef-b4d0f0d6f70a";
const OTHER_ID = "977696b6-5bf7-4cb8-afe8-381cb8377b82";
const PNG_BYTES = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 0,
]);

test("espelho público salva apenas nome e logo por empresa, sem dados protegidos", async (t) => {
  const root = await temporaryStore(t);
  const first = await saveLoginBranding({
    companyId: COMPANY_ID,
    companyName: "Shopping JK",
    logo: { bytes: PNG_BYTES, contentType: "image/png" },
  }, root);
  await saveLoginBranding({
    companyId: OTHER_ID,
    companyName: "Empresa teste",
    logo: null,
  }, root);

  assert.deepEqual(Object.keys(first).sort(), ["companyId", "companyName", "logoUrl"]);
  assert.equal(first.companyName, "Shopping JK");
  assert.match(first.logoUrl ?? "", new RegExp(
    `^/api/login-branding/${COMPANY_ID}/logo\\?v=[0-9a-f]{64}$`,
  ));
  assert.deepEqual(await readLoginBranding(COMPANY_ID, root), first);
  assert.deepEqual(await readLoginBranding(OTHER_ID, root), {
    companyId: OTHER_ID,
    companyName: "Empresa teste",
    logoUrl: null,
  });

  const version = new URL(first.logoUrl!, "http://localhost").searchParams.get("v");
  const logo = await readLoginBrandingLogo(COMPANY_ID, version, root);
  assert.equal(logo?.mimeType, "image/png");
  assert.deepEqual(logo?.bytes, PNG_BYTES);
  assert.equal(await readLoginBrandingLogo(OTHER_ID, version, root), null);
  assert.equal(await readLoginBrandingLogo(COMPANY_ID, "wrong-version", root), null);

  const diskMetadata = JSON.parse(
    await readFile(path.join(root, COMPANY_ID, "current.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.deepEqual(Object.keys(diskMetadata).sort(), [
    "companyId", "companyName", "logoMimeType", "logoSha256", "schemaVersion",
  ]);
});

test("último logo sincronizado vira o padrão; salvar sem logo não troca a marca", async (t) => {
  const root = await temporaryStore(t);
  assert.equal(await readDefaultLoginBranding(root), null);

  await saveLoginBranding({
    companyId: COMPANY_ID,
    companyName: "Empresa A",
    logo: { bytes: PNG_BYTES, contentType: "image/png" },
  }, root, { makeDefault: true });
  assert.equal((await readDefaultLoginBranding(root))?.companyId, COMPANY_ID);

  await saveLoginBranding({
    companyId: OTHER_ID,
    companyName: "Empresa B",
    logo: null,
  }, root, { makeDefault: true });
  assert.equal((await readDefaultLoginBranding(root))?.companyId, COMPANY_ID);

  await saveLoginBranding({
    companyId: OTHER_ID,
    companyName: "Empresa B",
    logo: { bytes: PNG_BYTES, contentType: "image/png" },
  }, root, { makeDefault: true });
  assert.equal((await readDefaultLoginBranding(root))?.companyId, OTHER_ID);

  await removeLoginBranding(COMPANY_ID, root);
  assert.equal((await readDefaultLoginBranding(root))?.companyId, OTHER_ID);
  await removeLoginBranding(OTHER_ID, root);
  assert.equal(await readDefaultLoginBranding(root), null);
});

test("espelho legado só vira padrão automático se houver um único logo válido", async (t) => {
  const root = await temporaryStore(t);
  await saveLoginBranding({
    companyId: COMPANY_ID,
    companyName: "Empresa A",
    logo: { bytes: PNG_BYTES, contentType: "image/png" },
  }, root);
  await saveLoginBranding({
    companyId: OTHER_ID,
    companyName: "Empresa B",
    logo: null,
  }, root);
  assert.equal((await readDefaultLoginBranding(root))?.companyId, COMPANY_ID);

  await saveLoginBranding({
    companyId: OTHER_ID,
    companyName: "Empresa B",
    logo: { bytes: PNG_BYTES, contentType: "image/png" },
  }, root);
  assert.equal(await readDefaultLoginBranding(root), null);
});

test("nova marca substitui a publicada e remoção é isolada e idempotente", async (t) => {
  const root = await temporaryStore(t);
  await saveLoginBranding({
    companyId: COMPANY_ID,
    companyName: "Empresa A",
    logo: { bytes: PNG_BYTES, contentType: "image/png" },
  }, root);
  await saveLoginBranding({
    companyId: OTHER_ID,
    companyName: "Empresa B",
    logo: null,
  }, root);
  const withoutLogo = await saveLoginBranding({
    companyId: COMPANY_ID,
    companyName: "Empresa A atualizada",
    logo: null,
  }, root);
  assert.equal(withoutLogo.logoUrl, null);
  assert.equal(await readLoginBrandingLogo(COMPANY_ID, null, root), null);

  await removeLoginBranding(COMPANY_ID, root);
  await removeLoginBranding(COMPANY_ID, root);
  assert.equal(await readLoginBranding(COMPANY_ID, root), null);
  assert.equal((await readLoginBranding(OTHER_ID, root))?.companyName, "Empresa B");
});

test("IDs, formato e tamanho do logo são validados antes da publicação", async (t) => {
  const root = await temporaryStore(t);
  assert.equal(normalizeLoginBrandingCompanyId("../other"), null);
  assert.equal(normalizeLoginBrandingCompanyId(COMPANY_ID.toUpperCase()), COMPANY_ID);
  await assert.rejects(() => saveLoginBranding({
    companyId: "../other",
    companyName: "Invasão",
    logo: null,
  }, root));
  await assert.rejects(() => removeLoginBranding("../other", root));
  assert.throws(() => validateLoginBrandingLogo(Buffer.from("<svg />"), "image/svg+xml"));
  assert.throws(() => validateLoginBrandingLogo(PNG_BYTES, "constructor"));
  assert.throws(() => validateLoginBrandingLogo(Buffer.from("<html />"), "image/png"));
  assert.throws(() => validateLoginBrandingLogo(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"));
});

test("sync autorizado funciona cross-company e GET público não consulta o backend", async (t) => {
  const root = await temporaryStore(t);
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.IPXDATA_API_URL;
  const originalBrandingDir = process.env.IPXDATA_PUBLIC_BRANDING_DIR;
  process.env.IPXDATA_API_URL = "http://127.0.0.1:8080";
  process.env.IPXDATA_PUBLIC_BRANDING_DIR = root;
  const backendPaths: string[] = [];
  let returnedCompanyId = COMPANY_ID;
  let logoAvailable = true;
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnvironment("IPXDATA_API_URL", originalApiUrl);
    restoreEnvironment("IPXDATA_PUBLIC_BRANDING_DIR", originalBrandingDir);
  });

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    backendPaths.push(url.pathname);
    assert.equal(url.origin, "http://127.0.0.1:8080");
    assert.match(new Headers(init?.headers).get("authorization") ?? "", /^Bearer /);
    if (url.pathname === "/api/v1/auth/me") {
      return Response.json({ id: "68bb5341-7671-4eed-a756-d8842cfbb437", company_id: OTHER_ID, is_master: false });
    }
    assert.equal(new Headers(init?.headers).get("x-company-id"), COMPANY_ID);
    if (url.pathname === `/api/v1/companies/${COMPANY_ID}`) {
      return Response.json({ id: returnedCompanyId, name: "Shopping JK", logo_url: "/protected/private.png" });
    }
    if (url.pathname === `/api/v1/companies/${COMPANY_ID}/logo`) {
      if (!logoAvailable) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(PNG_BYTES), {
        headers: { "content-type": "image/png" },
      });
    }
    throw new Error(`Unexpected backend path: ${url.pathname}`);
  };

  const masterToken = jwt("super-admin");
  const context = { params: Promise.resolve({ companyId: COMPANY_ID }) };
  const syncResponse = await postBrandingSync(new Request(
    `http://localhost/api/login-branding/${COMPANY_ID}/sync`,
    { method: "POST", headers: { authorization: `Bearer ${masterToken}` } },
  ) as Parameters<typeof postBrandingSync>[0], context);
  assert.equal(syncResponse.status, 200);
  const synced = await syncResponse.json() as Record<string, unknown>;
  assert.equal(synced.companyName, "Shopping JK");
  assert.match(String(synced.logoUrl), /\/api\/login-branding\/.*\/logo\?v=[a-f0-9]{64}$/);
  assert.deepEqual(await readDefaultLoginBranding(root), synced);
  assert.equal(JSON.stringify(synced).includes("protected/private"), false);
  assert.deepEqual(backendPaths, [
    "/api/v1/auth/me",
    `/api/v1/companies/${COMPANY_ID}`,
    `/api/v1/companies/${COMPANY_ID}/logo`,
  ]);

  const callsBeforePublicRead = backendPaths.length;
  const publicResponse = await getPublicBranding(new Request(
    `http://localhost/api/login-branding/${COMPANY_ID}`,
  ), context);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await publicResponse.json(), synced);
  const publicLogoResponse = await getPublicLogo(new Request(
    new URL(String(synced.logoUrl), "http://localhost"),
  ), context);
  assert.equal(publicLogoResponse.status, 200);
  assert.equal(publicLogoResponse.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await publicLogoResponse.arrayBuffer()), PNG_BYTES);
  assert.equal(backendPaths.length, callsBeforePublicRead);

  const defaultPublicResponse = await getDefaultPublicBranding();
  assert.equal(defaultPublicResponse.status, 200);
  assert.equal(defaultPublicResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await defaultPublicResponse.json(), synced);
  assert.equal(backendPaths.length, callsBeforePublicRead);

  const unauthorizedResponse = await postBrandingSync(new Request(
    `http://localhost/api/login-branding/${COMPANY_ID}/sync`, { method: "POST" },
  ) as Parameters<typeof postBrandingSync>[0], context);
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(backendPaths.length, callsBeforePublicRead);

  returnedCompanyId = OTHER_ID;
  const crossTenantResponse = await postBrandingSync(new Request(
    `http://localhost/api/login-branding/${COMPANY_ID}/sync`,
    { method: "POST", headers: { authorization: `Bearer ${masterToken}` } },
  ) as Parameters<typeof postBrandingSync>[0], context);
  assert.equal(crossTenantResponse.status, 503);
  assert.deepEqual(await readLoginBranding(COMPANY_ID, root), synced);
  returnedCompanyId = COMPANY_ID;

  logoAvailable = false;
  const missingAdvertisedLogoResponse = await postBrandingSync(new Request(
    `http://localhost/api/login-branding/${COMPANY_ID}/sync`,
    { method: "POST", headers: { authorization: `Bearer ${masterToken}` } },
  ) as Parameters<typeof postBrandingSync>[0], context);
  assert.equal(missingAdvertisedLogoResponse.status, 503);
  assert.deepEqual(await readLoginBranding(COMPANY_ID, root), synced);
  logoAvailable = true;

  const operatorResponse = await deleteBrandingSync(new Request(
    `http://localhost/api/login-branding/${COMPANY_ID}/sync`,
    { method: "DELETE", headers: { authorization: `Bearer ${jwt("operator")}` } },
  ) as Parameters<typeof deleteBrandingSync>[0], context);
  assert.equal(operatorResponse.status, 403);
  assert.ok(await readLoginBranding(COMPANY_ID, root));

  const deleteResponse = await deleteBrandingSync(new Request(
    `http://localhost/api/login-branding/${COMPANY_ID}/sync`,
    { method: "DELETE", headers: { authorization: `Bearer ${masterToken}` } },
  ) as Parameters<typeof deleteBrandingSync>[0], context);
  assert.equal(deleteResponse.status, 204);
  assert.equal(await readLoginBranding(COMPANY_ID, root), null);
  assert.equal(await readDefaultLoginBranding(root), null);
  assert.equal((await getDefaultPublicBranding()).status, 404);
});

function jwt(role: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    user_id: "68bb5341-7671-4eed-a756-d8842cfbb437",
    company_id: OTHER_ID,
    role,
    exp: Math.floor(Date.now() / 1000) + 300,
  })}.signature`;
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function temporaryStore(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ipx-login-branding-test-"));
  t.after(async () => {
    const expectedParent = path.resolve(os.tmpdir());
    if (path.dirname(path.resolve(root)) !== expectedParent ||
        !path.basename(root).startsWith("ipx-login-branding-test-")) {
      throw new Error("Diretório temporário fora do escopo do teste.");
    }
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
