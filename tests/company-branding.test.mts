import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ApiError, apiFetch } from "../lib/api.ts";
import {
  COMPANY_BRANDING_MAX_BYTES,
  companyBrandingFileError,
  companyBrandingPath,
  requireCompanyBrandingResponse,
} from "../lib/company-branding.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (pathname: string) =>
  readFileSync(resolve(projectRoot, pathname), "utf8");

test("branding aceita somente os formatos e o limite documentados", () => {
  for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
    assert.equal(
      companyBrandingFileError({ size: COMPANY_BRANDING_MAX_BYTES, type }, "logo"),
      null,
    );
  }

  assert.match(
    companyBrandingFileError(
      { size: COMPANY_BRANDING_MAX_BYTES + 1, type: "image/png" },
      "banner",
    ) ?? "",
    /5 MB/,
  );
  assert.match(
    companyBrandingFileError({ size: 10, type: "image/svg+xml" }, "logo") ?? "",
    /PNG, JPEG, GIF ou WebP/,
  );
  assert.match(
    companyBrandingFileError({ size: 0, type: "image/png" }, "logo") ?? "",
    /vazio/,
  );
});

test("branding usa rota administrativa canônica e certifica a resposta", () => {
  assert.equal(
    companyBrandingPath(" company-a ", "banner"),
    "/companies/company-a/banner",
  );
  assert.equal(
    companyBrandingPath("company/a", "logo"),
    "/companies/company%2Fa/logo",
  );
  assert.throws(() => companyBrandingPath(" ", "logo"), /empresa precisa estar salva/i);

  assert.deepEqual(
    requireCompanyBrandingResponse(
      {
        company_id: "company-a",
        kind: "LOGO",
        path: " uploads/internal.png ",
        url: " /api/v1/companies/company-a/logo ",
      },
      "company-a",
      "logo",
    ),
    {
      company_id: "company-a",
      kind: "logo",
      path: "uploads/internal.png",
      url: "/api/v1/companies/company-a/logo",
    },
  );
  assert.throws(
    () =>
      requireCompanyBrandingResponse(
        { company_id: "company-b", kind: "logo" },
        "company-a",
        "logo",
      ),
    /outra empresa/,
  );
  assert.throws(
    () =>
      requireCompanyBrandingResponse(
        { company_id: "company-a", kind: "banner" },
        "company-a",
        "logo",
      ),
    /não corresponde/,
  );
});

test("upload usa multipart file e prévia lê bytes com autenticação", () => {
  const helper = source("lib/company-branding.ts");
  const api = source("lib/api.ts");

  assert.match(helper, /const formData = new FormData\(\)/);
  assert.match(helper, /formData\.append\("file", file, file\.name\)/);
  assert.match(
    helper,
    /apiFetch<unknown>\(companyBrandingPath\(companyId, kind\), \{[\s\S]*?body: formData,[\s\S]*?companyScopeId: companyId,[\s\S]*?method: "POST"/,
  );
  assert.match(
    helper,
    /apiFetch<Blob>\(companyBrandingPath\(companyId, kind\), \{[\s\S]*?companyScopeId: companyId,[\s\S]*?dedupe: false,[\s\S]*?responseType: "blob",[\s\S]*?signal/,
  );
  assert.match(
    helper,
    /supportedCompanyBrandingMimeTypes\.has\(responseMimeType\)/,
    "uma resposta 200 que não seja imagem não pode virar prévia",
  );
  assert.match(api, /body !== undefined && !\(body instanceof FormData\)/);
  assert.match(
    api,
    /if \(response\.ok && responseType === "blob"\) \{\s*return response\.blob\(\)/,
    "somente respostas binárias bem-sucedidas devem ser lidas como Blob",
  );
});

test("transporte preserva multipart e diferencia Blob de erro JSON", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const formData = new FormData();
    formData.append("file", new Blob(["imagem"], { type: "image/png" }), "logo.png");
    globalThis.fetch = async (_input, init) => {
      assert.ok(init?.body instanceof FormData);
      assert.equal(new Headers(init.headers).has("content-type"), false);
      return Response.json({ ok: true });
    };
    assert.deepEqual(
      await apiFetch<{ ok: boolean }>("/companies/company-a/logo", {
        auth: false,
        body: formData,
        dedupe: false,
        method: "POST",
      }),
      { ok: true },
    );

    globalThis.fetch = async () =>
      new Response(new Blob(["imagem"], { type: "image/webp" }), {
        headers: { "content-type": "image/webp" },
        status: 200,
      });
    const blob = await apiFetch<Blob>("/companies/company-a/banner", {
      auth: false,
      dedupe: false,
      responseType: "blob",
    });
    assert.equal(blob.type, "image/webp");
    assert.equal(blob.size, 6);

    globalThis.fetch = async () =>
      Response.json({ error: "formato inválido" }, { status: 415 });
    await assert.rejects(
      apiFetch<Blob>("/companies/company-a/logo", {
        auth: false,
        dedupe: false,
        responseType: "blob",
      }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 415 &&
        error.message === "formato inválido",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Master salva a empresa antes do branding e permite retomar upload parcial", () => {
  const dashboard = source("components/app/super-admin-dashboard.tsx");
  const editor = source("components/app/company-branding-editor.tsx");
  const saveCompany = dashboard.slice(
    dashboard.indexOf("async function saveCompany()"),
    dashboard.indexOf("async function deleteCompany("),
  );

  assert.match(dashboard, /<CompanyBrandingEditor/);
  assert.match(dashboard, /logo_url\?: string \| null/);
  assert.match(dashboard, /banner_url\?: string \| null/);
  assert.match(saveCompany, /if \(name\.length > 255\)/);
  assert.match(saveCompany, /Number\.isInteger\(userLimit\)/);
  assert.match(saveCompany, /user_limit: userLimit/);
  assert.doesNotMatch(saveCompany, /Math\.trunc\(userLimit\)/);
  assert.match(
    saveCompany,
    /metadataSaved = true;[\s\S]*?publishSavedCompany\(savedCompany\);[\s\S]*?setEditingCompany\(savedCompany\);[\s\S]*?uploadCompanyBranding/,
    "o ID precisa existir e a criação precisa migrar para edição antes do upload",
  );
  assert.match(
    saveCompany,
    /if \(kind === "logo"\) setCompanyLogoFile\(null\);\s*else setCompanyBannerFile\(null\)/,
    "cada arquivo confirmado deve sair individualmente da fila",
  );
  assert.match(
    saveCompany,
    /if \(metadataSaved && brandingKindInProgress\)[\s\S]*?await loadCompanies\(\)/,
    "falha da imagem não pode desfazer nem duplicar a empresa já salva",
  );

  assert.match(editor, /URL\.createObjectURL\(blob\)/);
  assert.match(editor, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(editor, /accept=\{COMPANY_BRANDING_ACCEPT\}/);
  assert.doesNotMatch(
    editor,
    /src=\{.*(?:logo_url|banner_url)/,
    "a URL protegida da API não pode ser usada diretamente em uma imagem",
  );
});
