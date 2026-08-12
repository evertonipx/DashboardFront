import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("cenários congelam a empresa e descartam publicação tardia", () => {
  const source = readSource("components/app/scenario-manager.tsx");

  assert.match(source, /const requestedCompanyScopeId = companyScopeId\.trim\(\)/);
  assert.match(source, /scenarioRequestSequenceRef/);
  assert.match(
    source,
    /apiFetch<Scenario\[]>\("\/scenarios", \{\s*companyScopeId: requestedCompanyScopeId/,
  );
  assert.match(
    source,
    /`\/scenarios\/\$\{scenario\.id\}\/result`,\s*\{ companyScopeId: requestedCompanyScopeId \}/,
  );
  assert.match(
    source,
    /apiFetch<Camera\[]>\("\/cameras", \{\s*companyScopeId: requestedCompanyScopeId/,
  );
  assert.match(
    source,
    /`\/cameras\/\$\{camera\.id\}\/line-counts`,\s*\{ companyScopeId: requestedCompanyScopeId \}/,
  );
  assert.ok(
    source.match(/companyScopeId: requestedCompanyScopeId/g)?.length >= 7,
    "leituras e mutações tenant-aware devem reutilizar o escopo congelado",
  );
  assert.ok(
    source.match(
      /companyScopeIdRef\.current\.trim\(\) !== requestedCompanyScopeId/g,
    )?.length >= 5,
    "respostas de mutações antigas não podem publicar no novo tenant",
  );
});

test("gerenciador de visões invalida a consulta quando a empresa muda", () => {
  const source = readSource("components/app/views-manager.tsx");

  assert.match(source, /const requestedCompanyScopeId = companyScopeId\.trim\(\)/);
  assert.match(source, /scenarioRequestSequenceRef/);
  assert.match(
    source,
    /apiFetch<Scenario\[]>\("\/scenarios", \{\s*companyScopeId: requestedCompanyScopeId/,
  );
  assert.match(
    source,
    /requestSequence === scenarioRequestSequenceRef\.current[\s\S]*?companyScopeIdRef\.current\.trim\(\) === requestedCompanyScopeId/,
  );
  assert.match(source, /return \(\) => \{\s*active = false;/);
});

test("migração legada usa empresa explícita e revalida o escopo", () => {
  const source = readSource("lib/legacy-dashboard-view-migration.ts");

  assert.match(source, /fetchLegacyLiveView\(requestedCompanyId\)/);
  assert.match(
    source,
    /apiFetch<LegacyDashboardViewResponse>\("\/dashboard-views\/live", \{\s*companyScopeId/,
  );
  assert.match(
    source,
    /const initialStoredCompanyId = currentStoredCompanyScopeId\(\)/,
  );
  assert.match(
    source,
    /if \(currentStoredCompanyScopeId\(\) !== initialStoredCompanyId\) return false/,
  );
});

function readSource(pathname) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}
