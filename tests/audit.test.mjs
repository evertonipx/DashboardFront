import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const audit = loadTypeScriptModule("lib/audit.ts");

const companyId = "20a13438-9963-4e9e-8945-40d95385608c";

test("paths de auditoria usam apenas a paginação publicada pelo Swagger", () => {
  assert.equal(audit.auditListPath(2, 100), "/audit?limit=100&page=2");
  assert.equal(audit.auditDetailPath("00042"), "/audit/42");
  assert.throws(() => audit.auditListPath(0, 50), /page inválido/);
  assert.throws(() => audit.auditListPath(1, 201), /limit inválido/);
});

test("normaliza página e preserva BIGINT textual sem perder precisão", () => {
  const id = "9223372036854775807";
  const response = audit.normalizePaginatedAuditResponse(
    {
      data: [auditRow({ id })],
      limit: 50,
      page: 1,
      total: 1,
    },
    { companyId, limit: 50, page: 1 },
  );

  assert.equal(response.data[0].id, id);
  assert.equal(response.total, 1);
  assert.throws(
    () => audit.normalizeAuditLogId(Number.MAX_SAFE_INTEGER + 1),
    /BIGINT.*segurança/,
  );
});

test("rejeita resposta paginada fora do tenant e metadados incoerentes", () => {
  assert.throws(
    () =>
      audit.normalizePaginatedAuditResponse(
        {
          data: [auditRow({ company_id: "foreign-company" })],
          limit: 50,
          page: 1,
          total: 1,
        },
        { companyId, limit: 50, page: 1 },
      ),
    /fora da empresa autenticada/,
  );

  assert.throws(
    () =>
      audit.normalizePaginatedAuditResponse(
        { data: [], limit: 25, page: 1, total: 0 },
        { companyId, limit: 50, page: 1 },
      ),
    /limite 25.*limite solicitado.*50/,
  );
});

test("Master particiona catálogo multiempresa antes de validar a auditoria", () => {
  const selected = audit.normalizePaginatedAuditResponse(
    {
      data: [
        auditRow({
          action: null,
          company_id: "foreign-company",
          id: 41,
        }),
        auditRow({ id: 42 }),
        auditRow({ company_id: "another-foreign-company", id: 43 }),
      ],
      limit: 50,
      page: 1,
      total: 3,
    },
    {
      companyId,
      limit: 50,
      page: 1,
      partitionByCompanyId: true,
    },
  );

  assert.deepEqual(selected.data.map((entry) => entry.id), ["42"]);
  assert.equal(selected.total, 3);

  assert.throws(
    () =>
      audit.normalizePaginatedAuditResponse(
        {
          data: [auditRow({ company_id: undefined })],
          limit: 50,
          page: 1,
          total: 1,
        },
        {
          companyId,
          limit: 50,
          page: 1,
          partitionByCompanyId: true,
        },
      ),
    /company_id de registros de auditoria na posição 0 inválido/,
  );
});

test("detalhe certifica simultaneamente empresa e ID solicitado", () => {
  const normalized = audit.normalizeAuditLogResponse(auditRow({ id: 42 }), {
    companyId,
    id: "42",
  });
  assert.equal(normalized.id, "42");

  assert.throws(
    () =>
      audit.normalizeAuditLogResponse(auditRow({ id: 43 }), {
        companyId,
        id: "42",
      }),
    /registro solicitado foi 42/,
  );
});

test("decodifica JSON base64 em UTF-8 e redige segredos recursivamente", () => {
  const payload = {
    api_key: "ipx-secret-key",
    api_key_hash: "hash-que-nao-pode-vazar",
    name: "Câmera térrea",
    nested: {
      accessToken: "jwt-secret",
      password_hash: "hash-de-senha",
      rows: [
        { password: "123456", safe: 17 },
        "authorization: Bearer token-que-nao-pode-vazar",
      ],
    },
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const presentation = audit.decodeAuditData(encoded);

  assert.equal(presentation.format, "base64-json");
  assert.match(presentation.text, /Câmera térrea/);
  assert.match(presentation.text, /\[REDACTED\]/);
  assert.doesNotMatch(presentation.text, /ipx-secret-key/);
  assert.doesNotMatch(presentation.text, /hash-que-nao-pode-vazar/);
  assert.doesNotMatch(presentation.text, /jwt-secret/);
  assert.doesNotMatch(presentation.text, /hash-de-senha/);
  assert.doesNotMatch(presentation.text, /123456/);
  assert.doesNotMatch(presentation.text, /token-que-nao-pode-vazar/);
  assert.match(presentation.text, /"safe": 17/);
});

test("aceita JSON direto e trata texto ou payload vazio sem HTML", () => {
  const direct = audit.decodeAuditData(
    JSON.stringify({ password: "segredo", result: "ok" }),
  );
  assert.equal(direct.format, "json");
  assert.doesNotMatch(direct.text, /segredo/);
  assert.match(direct.text, /"result": "ok"/);

  const text = audit.decodeAuditData("password=nao-vazar; operação concluída");
  assert.equal(text.format, "text");
  assert.doesNotMatch(text.text, /nao-vazar/);
  assert.match(text.text, /\[REDACTED\]/);

  assert.deepEqual(audit.decodeAuditData(""), {
    format: "empty",
    text: "Sem dados adicionais.",
    truncated: false,
  });
});

test("redação defensiva suporta objetos cíclicos", () => {
  const cyclic = { safe: true };
  cyclic.self = cyclic;
  const redacted = audit.redactAuditValue(cyclic);

  assert.equal(redacted.safe, true);
  assert.equal(redacted.self, "[CIRCULAR]");
});

test("resume alterações de negócio antes e depois sem expor metadados técnicos", () => {
  const payload = {
    before: {
      active: false,
      company_id: "company-before-secret",
      ip_address: "10.0.0.10",
      name: "Entrada antiga",
      password: "senha-anterior",
      request_id: "request-before-secret",
      user_id: "user-before-secret",
    },
    after: {
      active: true,
      company_id: "company-after-secret",
      ip_address: "10.0.0.11",
      name: "Entrada principal",
      password: "senha-nova",
      request_id: "request-after-secret",
      user_id: "user-after-secret",
    },
    access_token: "token-fora-dos-containers",
    record_id: "record-secret",
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const presentation = audit.summarizeAuditBusinessData(encoded);

  assert.equal(presentation.subject, "Entrada principal");
  assert.deepEqual(presentation.changes, [
    { after: "Ativo", before: "Inativo", field: "Status" },
    { after: "Entrada principal", before: "Entrada antiga", field: "Nome" },
  ]);
  assert.deepEqual(presentation.details, []);
  assert.equal(presentation.omittedCount, 0);

  const visibleBusinessData = JSON.stringify(presentation);
  for (const privateValue of [
    "company-before-secret",
    "company-after-secret",
    "10.0.0.10",
    "10.0.0.11",
    "senha-anterior",
    "senha-nova",
    "request-before-secret",
    "request-after-secret",
    "user-before-secret",
    "user-after-secret",
    "token-fora-dos-containers",
    "record-secret",
  ]) {
    assert.doesNotMatch(visibleBusinessData, new RegExp(privateValue));
  }
});

test("resume mudanças estruturadas e informações relacionadas em linguagem de negócio", () => {
  const presentation = audit.summarizeAuditBusinessData(
    JSON.stringify({
      changes: {
        enabled: { old: false, new: true },
        role: { from: "operator", to: "admin" },
        user_id: { from: "user-one", to: "user-two" },
        api_key: { from: "old-key", to: "new-key" },
      },
      after: {
        description: "Acesso administrativo da operação",
        enabled: true,
        name: "Maria Silva",
        role: "admin",
      },
    }),
  );

  assert.equal(presentation.subject, "Maria Silva");
  assert.deepEqual(presentation.changes, [
    {
      after: "Habilitado",
      before: "Desabilitado",
      field: "Disponibilidade",
    },
    { after: "admin", before: "operator", field: "Perfil de acesso" },
  ]);
  assert.deepEqual(presentation.details, [
    {
      field: "Descrição",
      value: "Acesso administrativo da operação",
    },
    { field: "Nome", value: "Maria Silva" },
  ]);
  assert.equal(presentation.omittedCount, 0);
  assert.doesNotMatch(JSON.stringify(presentation), /user-one|user-two|old-key|new-key/);
});

test("limita mudanças, detalhes e payloads grandes para preservar a responsividade", () => {
  const businessFields = [
    "name",
    "active",
    "enabled",
    "capacity",
    "description",
    "email",
    "plan",
    "role",
    "timezone",
    "user_limit",
    "start_time",
    "end_time",
    "module_name",
    "scenario_name",
    "worker_name",
  ];
  const before = Object.fromEntries(
    businessFields.map((field, index) => [field, `anterior-${index}`]),
  );
  const after = Object.fromEntries(
    businessFields.map((field, index) => [field, `novo-${index}`]),
  );
  const changes = audit.summarizeAuditBusinessData(
    JSON.stringify({ before, after }),
  );

  assert.equal(changes.changes.length, 12);
  assert.equal(changes.details.length, 0);
  assert.equal(changes.omittedCount, 3);

  const details = audit.summarizeAuditBusinessData(
    JSON.stringify(
      Object.fromEntries(
        businessFields.slice(0, 13).map((field, index) => [field, `valor-${index}`]),
      ),
    ),
  );
  assert.equal(details.changes.length, 0);
  assert.equal(details.details.length, 10);
  assert.equal(details.omittedCount, 3);

  assert.deepEqual(audit.summarizeAuditBusinessData("x".repeat(100_001)), {
    changes: [],
    details: [],
    omittedCount: 0,
    subject: "",
  });
});

test("página usa guarda de auditoria e apresenta somente contexto de negócio", () => {
  const source = readFileSync(
    resolve(projectRoot, "app/manager/audit/page.tsx"),
    "utf8",
  );
  const managerLayout = readFileSync(
    resolve(projectRoot, "app/manager/layout.tsx"),
    "utf8",
  );
  const routeShell = readFileSync(
    resolve(projectRoot, "components/app/authenticated-route-shell.tsx"),
    "utf8",
  );
  const manager = readFileSync(
    resolve(projectRoot, "components/app/audit-manager.tsx"),
    "utf8",
  );
  const appShell = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  const authGuard = readFileSync(
    resolve(projectRoot, "components/app/auth-guard.tsx"),
    "utf8",
  );

  assert.match(managerLayout, /<ManagerRouteShell>\{children\}<\/ManagerRouteShell>/);
  assert.match(routeShell, /"\/manager\/audit": "audit"/);
  assert.match(
    routeShell,
    /<AuthGuard[\s\S]*?requireManager[\s\S]*?requireResource=\{MANAGER_RESOURCE_BY_PATH\[pathname\]\}/,
  );
  assert.match(
    appShell,
    /href: "\/manager\/audit",[\s\S]*?label: "Auditoria",[\s\S]*?canShow: canViewAudit/,
    "o menu deve usar a mesma decisão exclusiva do superadmin aplicada à rota",
  );
  assert.match(
    authGuard,
    /case "audit":\s*return canViewAudit\(user\)/,
    "acessar a URL diretamente deve passar pela mesma decisão de acesso do menu",
  );
  assert.match(source, /DeferredAuditManager as AuditManager/);
  assert.match(source, /<AuditManager \/>/);
  assert.match(manager, /auditListPath\(page, limit\)/);
  assert.equal((manager.match(/apiFetch<unknown>/g) ?? []).length, 1);
  assert.doesNotMatch(manager, /auditDetailPath|normalizeAuditLogResponse|detailId/);
  assert.match(manager, /useEffectiveCompanyScopeId\(user\)/);
  assert.match(manager, /usesMasterCrossCompanyScope\([\s\S]*?user,[\s\S]*?companyScopeId/);
  assert.match(
    manager,
    /partitionByCompanyId: masterCrossCompanyScope/,
  );
  assert.match(manager, /summarizeAuditBusinessData\(detail\.data\)/);
  assert.doesNotMatch(manager, /detail\.(?:record_id|request_id|company_id|ip_address)/);
  assert.doesNotMatch(manager, /\{detail\.data\}/);
  assert.doesNotMatch(manager, /error\.message/);
  assert.doesNotMatch(manager, /<pre/);
  assert.doesNotMatch(
    manager,
    />\s*(?:Company ID|User ID|Record ID|Request ID|Endereço IP|IP)\s*</i,
  );
  assert.match(manager, />O que mudou</);
  assert.match(manager, />Antes</);
  assert.match(manager, />Depois</);
  assert.match(manager, /Detalhes da alteração/);
  assert.match(manager, /Área alterada/);
});

function auditRow(overrides = {}) {
  return {
    action: "UPDATE",
    company_id: companyId,
    created_at: "2026-09-02T13:45:00Z",
    data: "e30=",
    id: 42,
    ip_address: "192.168.1.10",
    record_id: "b15e5efa-fa71-4bb8-a15b-a93f4a42c99b",
    request_id: "req-abc123",
    table_name: "camera",
    user_id: "550e8400-e29b-41d4-a716-446655440000",
    ...overrides,
  };
}

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const cached = moduleCache.get(filename);
  if (cached) return cached.exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return nodeRequire(specifier);
    return loadTypeScriptModule(`${specifier.slice(2)}.ts`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
