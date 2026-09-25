import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

test("Master sincroniza logo de login após salvar e limpa espelho ao excluir", () => {
  const dashboard = source("components/app/super-admin-dashboard.tsx");
  const editor = source("components/app/company-branding-editor.tsx");
  const saveCompany = dashboard.slice(
    dashboard.indexOf("async function saveCompany()"),
    dashboard.indexOf("async function deleteCompany("),
  );
  const deleteCompany = dashboard.slice(
    dashboard.indexOf("async function deleteCompany("),
    dashboard.indexOf("async function saveUser("),
  );

  assert.match(
    saveCompany,
    /await syncCompanyLoginBranding\(savedCompany\.id, "POST"\)/,
    "o endpoint autenticado deve certificar o logo recém-enviado ou já existente",
  );
  assert.doesNotMatch(
    saveCompany,
    /if \(savedCompany\.logo_url\?\.trim\(\)\)/,
    "o campo opcional logo_url não pode bloquear a sincronização",
  );
  assert.match(
    saveCompany,
    /catch \{[\s\S]*?loginLogoSyncFailed = true;[\s\S]*?toast\.success\(/,
    "falha do espelho não deve invalidar o salvamento da empresa",
  );
  assert.match(
    deleteCompany,
    /await apiFetch\(`\/companies\/\$\{company\.id\}`,[\s\S]*?method: "DELETE",[\s\S]*?await syncCompanyLoginBranding\(company\.id, "DELETE"\)/,
  );
  assert.match(
    dashboard,
    /`\/api\/login-branding\/\$\{encodeURIComponent\(companyId\)\}\/sync`/,
  );
  assert.match(
    dashboard,
    /headers: \{ Authorization: `Bearer \$\{token\}` \}/,
  );
  const syncCompany = dashboard.slice(
    dashboard.indexOf("async function syncCompanyLoginBranding("),
    dashboard.indexOf("function ExecutiveStat("),
  );
  assert.match(
    syncCompany,
    /await apiFetch<unknown>\("\/auth\/me", \{[\s\S]*?bypassReadCache: true,[\s\S]*?captureAccessToken\(accessToken\)[\s\S]*?dedupe: false/,
    "a sincronização deve usar o token efetivo de uma requisição com renovação de sessão",
  );
  assert.match(
    syncCompany,
    /getStoredSession\(\)\?\.access_token !== token/g,
    "troca de sessão durante a sincronização não pode ser aceita",
  );
  assert.match(editor, /Logo da tela de login/);
  assert.match(editor, /url\.searchParams\.set\("empresa", companyId\)/);
});

test("sincronização do Master envia o token renovado e rejeita troca de sessão", async () => {
  const dashboard = source("components/app/super-admin-dashboard.tsx");
  const functionSource = dashboard.slice(
    dashboard.indexOf("async function syncCompanyLoginBranding("),
    dashboard.indexOf("function ExecutiveStat("),
  );
  const compiled = ts.transpileModule(functionSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const load = new Function(
    "apiFetch", "getStoredSession", "fetch",
    `${compiled}\nreturn syncCompanyLoginBranding;`,
  ) as (
    apiFetch: (path: string, options: { captureAccessToken: (token: string) => void }) => Promise<unknown>,
    getStoredSession: () => { access_token: string } | null,
    fetch: typeof globalThis.fetch,
  ) => (companyId: string, method: "POST" | "DELETE") => Promise<void>;

  const companyId = "dcd467c6-4c4e-4517-914b-d119ee393e6c";
  let activeToken = "expired-token";
  let requests = 0;
  const apiFetchWithRefresh = async (
    path: string,
    options: { captureAccessToken: (token: string) => void },
  ) => {
    assert.equal(path, "/auth/me");
    activeToken = "refreshed-token";
    options.captureAccessToken(activeToken);
    return { id: "master" };
  };
  const sync = load(
    apiFetchWithRefresh,
    () => ({ access_token: activeToken }),
    async (_input, init) => {
      requests += 1;
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer refreshed-token");
      assert.equal(init?.method, "POST");
      return new Response(null, { status: 200 });
    },
  );
  await sync(companyId, "POST");
  assert.equal(requests, 1);

  const changedBeforeSend = load(
    async (_path, options) => {
      options.captureAccessToken("refreshed-token");
      activeToken = "different-account-token";
    },
    () => ({ access_token: activeToken }),
    async () => { throw new Error("Não deve publicar com outra sessão."); },
  );
  await assert.rejects(
    changedBeforeSend(companyId, "POST"),
    /sessão foi alterada antes/,
  );

  activeToken = "refreshed-token";
  const changedDuringSend = load(
    async (_path, options) => { options.captureAccessToken(activeToken); },
    () => ({ access_token: activeToken }),
    async () => {
      activeToken = "different-account-token";
      return new Response(null, { status: 200 });
    },
  );
  await assert.rejects(
    changedDuringSend(companyId, "POST"),
    /sessão foi alterada durante/,
  );
});
