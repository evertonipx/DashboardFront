import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
  "utf8",
);

test("Superadmin reutiliza usuários e módulos certificados sem novo GET, exceto em Atualizar", () => {
  const start = source.indexOf("const loadCompanyDetails = React.useCallback");
  const end = source.indexOf("const loadCompanyModules = React.useCallback", start);
  assert.ok(start >= 0 && end > start);
  const loader = source.slice(start, end);

  assert.match(loader, /if \(!force && !includeOperational && cachedUsers && cachedModules\)/);
  assert.match(loader, /!force && cachedUsers\s*\? Promise\.resolve\(cachedUsers\)\s*: apiFetch<ManagedUser\[\]>/);
  assert.match(loader, /refreshModules = force/);
  assert.match(loader, /!refreshModules && cachedModules\s*\? Promise\.resolve\(cachedModules\)\s*: apiFetch<CompanyModule\[\]>/);
  assert.match(loader, /companyScopeId: companyId,\s*signal: controller\.signal/);
  assert.match(source, /loadCompanyDetails\(companyId, \{ force: true, refreshModules: false \}\)/);
  assert.match(source, /loadCompanyDetails\(selectedCompanyId, \{ force: true \}\)/);
});

test("falha ao descobrir super-admins não se transforma em lista vazia certificada", () => {
  const start = source.indexOf("const loadMasterUsers = React.useCallback");
  const end = source.indexOf("const loadCompanyDetails = React.useCallback", start);
  assert.ok(start >= 0 && end > start);
  const loader = source.slice(start, end);

  assert.match(loader, /companyUsersCacheRef\.current\.set\(company\.id, scopedRows\)/);
  assert.match(loader, /catch \{[\s\S]*?return \{ rows: cached \?\? \[\], unavailable: true \}/);
  assert.match(loader, /setMasterUsersUnavailableCompanies\([\s\S]*?result\.unavailable/);
  assert.doesNotMatch(loader, /apiFetch<ManagedUser\[\]>[\s\S]*?\.catch\(\(\) => \[\]\)/);
  assert.match(source, /A lista pode estar incompleta:[\s\S]*?Use Atualizar para tentar novamente/);
});

test("exclusão individual ou em lote invalida somente os dados das empresas removidas", () => {
  const bulkStart = source.indexOf("async function deleteCheckedCompanies");
  const bulkEnd = source.indexOf("async function loadUserPermissions", bulkStart);
  const singleStart = source.indexOf("async function deleteCompany(company: Company)");
  const singleEnd = source.indexOf("async function saveUser", singleStart);
  assert.ok(bulkStart >= 0 && bulkEnd > bulkStart);
  assert.ok(singleStart >= 0 && singleEnd > singleStart);

  for (const [operation, fragment] of [
    ["lote", source.slice(bulkStart, bulkEnd)],
    ["individual", source.slice(singleStart, singleEnd)],
  ] as const) {
    assert.match(fragment, /companyUsersCacheRef\.current\.delete\(/, operation);
    assert.match(fragment, /companyModulesCacheRef\.current\.delete\(/, operation);
    assert.match(fragment, /companyWorkersCacheRef\.current\.delete\(/, operation);
    assert.match(fragment, /masterUsersRequestSequenceRef\.current \+= 1/, operation);
    assert.match(fragment, /setMasterUsersLoaded\(false\)/, operation);
  }
});

test("Atualizar no Master ignora TTL dos catálogos, sem desativar cache da entrada", () => {
  assert.match(source, /const loadCompanies = React\.useCallback\(async \([\s\S]*?bypassReadCache: force/);
  assert.match(source, /onClick=\{\(\) => void loadCompanies\(\{ force: true \}\)\}/);
  assert.match(source, /apiFetch<IpxModule\[\]>\("\/modules", \{ bypassReadCache: force \}\)/);
  assert.match(source, /apiFetch<Permission\[\]>\("\/permissions", \{ bypassReadCache: force \}\)/);
  assert.match(source, /bypassReadCache: force,\s*companyScopeId: companyId,\s*signal: controller\.signal/);
});
