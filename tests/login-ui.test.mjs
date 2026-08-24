import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const loginSource = readFileSync("app/login/page.tsx", "utf8");
const brandingSource = readFileSync("lib/login-branding.ts", "utf8");

function loadLoginBrandingModule() {
  const compiled = ts.transpileModule(brandingSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, {
    URLSearchParams,
    exports: compiledModule.exports,
    module: compiledModule,
    process,
  });
  return compiledModule.exports;
}

test("login enterprise preserva o contrato autenticado e a navegação pós-login", () => {
  assert.match(loginSource, /await login\(email\.trim\(\), password\)/);
  assert.match(
    loginSource,
    /router\.replace\(await resolvePostLoginPath\(currentUser\)\)/,
  );
  assert.doesNotMatch(loginSource, /company_id\s*[:=]|X-Company-ID|apiFetch\(/);
});

test("login enterprise é responsivo, tematizável e mantém contraste da marca", () => {
  assert.match(loginSource, /min-h-\[100dvh\]/);
  assert.match(
    loginSource,
    /lg:grid-cols-\[minmax\(0,1\.08fr\)_minmax\(420px,0\.92fr\)\]/,
  );
  assert.match(loginSource, /<aside[\s\S]*?brandPanelStyle\(branding\.accentColor\)/);
  assert.match(loginSource, /backgroundColor: "#07111f"/);
  assert.match(loginSource, /<ThemeToggle/);
  assert.match(loginSource, /LOGIN_CAPABILITIES\.map/);
});

test("apresentação do login permanece enterprise e textualmente minimalista", () => {
  assert.doesNotMatch(
    loginSource,
    /Decisões operacionais com contexto, clareza e velocidade/,
  );
  assert.doesNotMatch(
    loginSource,
    /Acompanhe operações, investigue tendências e transforme dados em ações/,
  );
  assert.doesNotMatch(loginSource, /description: "Indicadores e eventos relevantes/);
  assert.doesNotMatch(loginSource, /description: "Períodos, comparações e relatórios/);
  assert.doesNotMatch(loginSource, /description: "Acesso autenticado e informações/);
  assert.doesNotMatch(loginSource, /Acesso restrito a usuários autorizados/);
  assert.doesNotMatch(loginSource, /Governança multiempresa/);
  assert.match(loginSource, /title: "Inteligência de dados"/);
  assert.match(loginSource, /flex min-w-0 items-center gap-3/);
});

test("formulário de acesso expõe estados e controles para tecnologia assistiva", () => {
  assert.match(loginSource, /aria-busy=\{submitting\}/);
  assert.match(loginSource, /id="login-error"[\s\S]*?role="alert"/);
  assert.match(loginSource, /autoComplete="email"/);
  assert.match(loginSource, /autoComplete="current-password"/);
  assert.match(loginSource, /aria-pressed=\{showPassword\}/);
  assert.match(loginSource, /LoaderCircle[\s\S]*?Validando acesso/);
});

test("branding opcional nunca bloqueia o login quando storage está indisponível", () => {
  assert.match(
    brandingSource,
    /function readStoredBrandKey\(\)[\s\S]*?try \{[\s\S]*?localStorage\.getItem[\s\S]*?catch \{[\s\S]*?return ""/,
  );
  assert.match(
    brandingSource,
    /function writeStoredBrandKey\(key: string\)[\s\S]*?try \{[\s\S]*?localStorage\.setItem[\s\S]*?catch \{/,
  );
});

test("branding extremo preserva contraste e limita nomes sem separadores", () => {
  const branding = loadLoginBrandingModule();
  assert.equal(branding.readableLoginBrandColor("#FFFFFF"), "#0F3B66");
  assert.equal(branding.readableLoginBrandColor("#FFFF00"), "#0F3B66");
  assert.equal(branding.readableLoginBrandColor("#0B4EA2"), "#0B4EA2");
  assert.equal(
    branding.loginBrandColorWithAlpha("#FFFFFF", 0.28),
    "rgb(255 255 255 / 0.28)",
  );

  const previousBrands = process.env.NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS;
  process.env.NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS = JSON.stringify({
    tenant: { companyName: "X".repeat(240) },
  });
  try {
    const resolved = branding.resolveLoginBranding({
      hostname: "localhost",
      search: "?brand=tenant",
    });
    assert.equal(resolved.companyName.length, 120);
  } finally {
    if (previousBrands === undefined) {
      delete process.env.NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS;
    } else {
      process.env.NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS = previousBrands;
    }
  }

  assert.match(loginSource, /\[overflow-wrap:anywhere\]/);
});
