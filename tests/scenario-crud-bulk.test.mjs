import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const [label, pathname, collectionPath] of [
  ["Contagem", "components/app/scenario-manager.tsx", "scenarios"],
  [
    "Ocupação",
    "components/app/occupancy-scenario-manager.tsx",
    "occupancy/scenarios",
  ],
]) {
  test(`${label}: seleção em lote respeita filtro e usa o checkbox compartilhado`, () => {
    const source = readSource(pathname);

    assert.match(source, /import \{ Checkbox \} from "@\/components\/ui\/checkbox"/);
    assert.match(source, /const filteredScenarios = React\.useMemo/);
    assert.match(source, /filteredScenarios\.map\(\(scenario\) => scenario\.id\)/);
    assert.match(source, /checked=\{scenarioSelectionState\}/);
    assert.match(source, /checked=\{selected\}/);
    assert.match(source, /"indeterminate"/);
    assert.match(source, /Excluir selecionados/);
  });

  test(`${label}: ações em lote reaproveitam somente as mutações documentadas`, () => {
    const source = readSource(pathname);
    const escapedPath = collectionPath.replace("/", "\\/");

    assert.match(
      source,
      new RegExp(
        `apiFetch\\(\\\`\\/${escapedPath}\\/\\$\\{scenario\\.id\\}\\\`, \\{[\\s\\S]*?body: \\{ active \\},[\\s\\S]*?method: "PUT"`,
      ),
    );
    assert.match(
      source,
      new RegExp(
        `apiFetch\\(\\\`\\/${escapedPath}\\/\\$\\{scenario\\.id\\}\\\`, \\{[\\s\\S]*?method: "DELETE"`,
      ),
    );
    assert.match(source, /for \(const scenario of candidates\)/);
    assert.doesNotMatch(
      source,
      /Promise\.all\(\s*candidates\.map/,
      "mutações destrutivas não devem saturar a API em paralelo",
    );
    assert.match(source, /setSelectedScenarioIds\(failedIds\)/);
    assert.match(source, /activeSelectedScenarioCount/);
    assert.match(source, /Desativar cenários selecionados\?/);
  });
}

test("Contagem certifica o catálogo antes de editar ou excluir", () => {
  const source = readSource("components/app/scenario-manager.tsx");

  assert.match(source, /scenarioCatalogCompanyId === companyScopeId\.trim\(\)/);
  assert.match(
    source,
    /setScenarios\(\[\]\);\s*setResults\(\{\}\);\s*setScenarioCatalogCompanyId\(""\)/,
  );
  assert.match(
    source,
    /function openEditDialog[\s\S]*?!scenarioCatalogCertified[\s\S]*?scenario\.company_id !== companyScopeId\.trim\(\)/,
  );
  assert.match(
    source,
    /async function deleteScenario[\s\S]*?!scenarioCatalogCertified[\s\S]*?scenario\.company_id !== requestedCompanyScopeId/,
  );
  assert.ok(
    source.match(/!scenarioCatalogCertified/g)?.length >= 4,
    "criação, edição e lotes devem permanecer bloqueados até certificar o tenant",
  );
});

test("Ocupação particiona catálogo multiempresa antes da validação de domínio", () => {
  const source = readSource(
    "components/app/occupancy-scenario-manager.tsx",
  );

  assert.match(source, /usesMasterCrossCompanyScope/);
  assert.match(
    source,
    /selectExplicitCompanyScopedRows\(response, requestedCompanyId,[\s\S]*?requireOccupancyScenarioRows\(payload, requestedCompanyId\)/,
  );
  assert.match(
    source,
    /requestSequence === scenarioRequestSequenceRef\.current &&\s*companyScopeIdRef\.current === requestedCompanyId/,
  );
});

test("PUTs em lote certificam entidade retornada e aceitam resposta vazia", () => {
  const counting = readSource("components/app/scenario-manager.tsx");
  const occupancy = readSource(
    "components/app/occupancy-scenario-manager.tsx",
  );

  assert.match(
    counting,
    /apiFetch<unknown>\([\s\S]*?method: "PUT"[\s\S]*?requireOptionalScenarioMutationResponse\(response,[\s\S]*?active,[\s\S]*?companyId: requestedCompanyScopeId,[\s\S]*?expectedId: scenario\.id/,
  );
  assert.match(
    counting,
    /if \(value === undefined \|\| value === null \|\| value === ""\) return;[\s\S]*?requireScenarioRows\(\[value\], companyId\)/,
  );
  assert.match(
    occupancy,
    /apiFetch<unknown>\([\s\S]*?method: "PUT"[\s\S]*?requireOptionalOccupancyStatusResponse\(response,[\s\S]*?active,[\s\S]*?companyId: requestedCompanyId,[\s\S]*?expectedId: scenario\.id/,
  );
  assert.match(
    occupancy,
    /function isEmptyMutationResponse[\s\S]*?value === undefined \|\| value === null \|\| value === ""/,
  );
});

test("Ocupação descarta conclusão tardia sem relatar falha após troca de tenant", () => {
  const source = readSource(
    "components/app/occupancy-scenario-manager.tsx",
  );

  assert.doesNotMatch(source, /requireUnchangedCompanyScope/);
  assert.match(
    source,
    /await apiFetch\(`\/occupancy\/scenarios\/\$\{scenario\.id\}`[\s\S]*?if \(requestedCompanyId !== companyScopeIdRef\.current\) return;[\s\S]*?catch \{\s*if \(requestedCompanyId !== companyScopeIdRef\.current\) return;/,
  );
  assert.ok(
    source.match(/if \(companyId !== companyIdRef\.current\) return;/g)?.length >=
      3,
    "salvamento deve silenciar sucesso e erro de uma empresa que deixou de ser ativa",
  );
});

function readSource(pathname) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}
