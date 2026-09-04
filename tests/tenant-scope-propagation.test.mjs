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
    /apiFetch<unknown>\("\/scenarios", \{\s*companyScopeId: requestedCompanyScopeId/,
  );
  assert.match(
    source,
    /selectExplicitCompanyScopedRows\([\s\S]*?requestedCompanyScopeId[\s\S]*?requireScenarioRows\(payload, requestedCompanyScopeId\)/,
  );
  assert.match(
    source,
    /`\/scenarios\/\$\{scenario\.id\}\/result`,\s*\{[\s\S]*?companyScopeId: requestedCompanyScopeId,[\s\S]*?signal: controller\.signal/,
  );
  assert.match(
    source,
    /apiFetch<unknown>\("\/cameras", \{\s*companyScopeId: requestedCompanyScopeId/,
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

test("gerenciador de visões certifica cenários do Video Wall no tenant atual", () => {
  const source = readSource("components/app/views-manager.tsx");

  assert.match(source, /const requestedCompanyScopeId = companyScopeId\.trim\(\)/);
  assert.match(source, /scenarioRequestSequenceRef/);
  assert.match(
    source,
    /apiFetch<unknown>\("\/scenarios", \{\s*companyScopeId: requestedCompanyScopeId/,
  );
  assert.match(
    source,
    /selectExplicitCompanyScopedRows\([\s\S]*?requestedCompanyScopeId[\s\S]*?requireScenarioRows\(payload, requestedCompanyScopeId\)/,
  );
  assert.match(
    source,
    /requestSequence === scenarioRequestSequenceRef\.current[\s\S]*?companyScopeIdRef\.current\.trim\(\) === requestedCompanyScopeId/,
  );
  assert.match(source, /return \(\) => \{\s*active = false;/);
  assert.doesNotMatch(
    source,
    /if \(workspaceTab !== "view-builder"\) \{[\s\S]*?return;/,
    "o Video Wall também precisa do catálogo certificado para validar seus cenários",
  );
  assert.match(
    source,
    /scenarioCatalog\.companyId === companyScopeId[\s\S]*?: EMPTY_SCENARIOS/,
    "cenários do tenant anterior não podem permanecer visíveis durante a troca",
  );
  assert.match(
    source,
    /setScenarioCatalog\(\{ companyId: requestedCompanyScopeId, rows: \[\] \}\);[\s\S]*?setSelectedScenarioIds\(\[\]\);[\s\S]*?setWidgetSelectedScenarioIds\(\[\]\);/,
    "a troca de tenant deve limpar catálogo e seleções antes da nova resposta",
  );
  assert.match(
    source,
    /const selectedScenarioIdsForScope = React\.useMemo\([\s\S]*?scenarioIdSet\.has\(id\)/,
    "seleções persistidas devem ser revalidadas contra o catálogo do tenant atual",
  );
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /controller\.abort\(\)/);
});

test("todas as superfícies particionam catálogo multiempresa antes de validar", () => {
  for (const pathname of [
    "components/app/embedded-live-view.tsx",
    "components/app/occupancy-scenario-manager.tsx",
    "components/app/period-analysis-dashboard.tsx",
    "components/app/realtime-dashboard.tsx",
    "components/app/scenario-manager.tsx",
    "components/app/scenario-reports-dashboard.tsx",
    "components/app/super-admin-dashboard.tsx",
    "components/app/views-manager.tsx",
  ]) {
    const source = readSource(pathname);
    assert.match(
      source,
      /selectExplicitCompanyScopedRows/,
      `${pathname} deve certificar company_id antes de publicar o catálogo`,
    );
  }

  for (const pathname of [
    "components/app/occupancy-scenario-manager.tsx",
    "components/app/period-analysis-dashboard.tsx",
    "components/app/scenario-reports-dashboard.tsx",
  ]) {
    const source = readSource(pathname);
    assert.doesNotMatch(
      source,
      /require(?:Occupancy)?ScenarioRows\((?:response|scenarioRows), (?:requestCompanyScopeId|requestedCompanyId|companyScopeId)\)/,
      `${pathname} não pode abortar no primeiro cenário estrangeiro antes da partição`,
    );
  }
});

test("partição multiempresa é silenciosa sem esconder falhas operacionais reais", () => {
  for (const pathname of [
    "components/app/embedded-live-view.tsx",
    "components/app/realtime-dashboard.tsx",
    "components/app/super-admin-dashboard.tsx",
    "components/app/worker-manager.tsx",
  ]) {
    const source = readSource(pathname);
    assert.doesNotMatch(
      source,
      /worker\(s\).*foram ocultados|cenário\(s\).*foram ocultados|registro\(s\) duplicado\(s\).*consolidados/,
      `${pathname} não deve expor detalhes técnicos da partição ao usuário`,
    );
  }

  const realtime = readSource("components/app/realtime-dashboard.tsx");
  assert.match(realtime, /Vínculos operacionais indisponíveis/);
  assert.match(realtime, /Cenários de Contagem indisponíveis/);
});

test("migração legada importa todas as superfícies no escopo pessoal e revalida a empresa", () => {
  const source = readSource("lib/legacy-dashboard-view-migration.ts");

  assert.match(
    source,
    /LEGACY_DASHBOARD_MIGRATIONS[\s\S]*?menuKey: "live"[\s\S]*?menuKey: "analysis"[\s\S]*?menuKey: "reports"[\s\S]*?menuKey: "occupancy"/,
  );
  assert.match(
    source,
    /apiFetch<LegacyDashboardViewResponse>\(\s*`\/dashboard-views\/\$\{menuKey\}`[\s\S]*?companyScopeId, expectedAccessToken/,
  );
  assert.match(
    source,
    /const initialStoredCompanyId = currentStoredCompanyScopeId\(\)/,
  );
  assert.match(
    source,
    /!shouldApply\(\) \|\|\s*currentStoredCompanyScopeId\(\) !== initialStoredCompanyId[\s\S]*?return false/,
  );
  assert.match(
    source,
    /loadSavedScopedCardPreferences\([\s\S]*?definition\.menuKey,[\s\S]*?cardIds,[\s\S]*?responseCompanyId,[\s\S]*?requestedUserId/,
  );
  assert.match(
    source,
    /saveCardPreferences\([\s\S]*?definition\.menuKey,[\s\S]*?preferences,[\s\S]*?cardIds,[\s\S]*?responseCompanyId,[\s\S]*?requestedUserId/,
  );
});

function readSource(pathname) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}
