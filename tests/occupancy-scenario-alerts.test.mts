import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { requireOccupancyAlertRows } from "../lib/occupancy-validation.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readSource(pathname: string) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}

function expectSource(source: string, pattern: RegExp, message: string) {
  assert.ok(pattern.test(source), message);
}

test("gestão de cenários abre alertas por linha sem antecipar a consulta no catálogo", () => {
  const manager = readSource("components/app/occupancy-scenario-manager.tsx");
  const catalogStart = manager.indexOf("const loadScenarios =");
  const catalogEnd = manager.indexOf("const loadAreaOptions =", catalogStart);

  assert.ok(catalogStart >= 0 && catalogEnd > catalogStart);
  assert.doesNotMatch(
    manager.slice(catalogStart, catalogEnd),
    /\/occupancy\/scenarios\/[^\s]*\/alerts/,
    "listar cenários não deve consultar alertas de cada linha",
  );
  expectSource(manager, /occupancy-scenario-alerts-dialog/, "manager deve importar o diálogo de alertas");
  expectSource(manager, /Ver alertas/, "cada cenário deve oferecer a ação de leitura");
  expectSource(manager, /<OccupancyScenarioAlertsDialog\b/, "manager deve montar o diálogo de alertas");
  expectSource(
    manager,
    /onClick=\{\(\) => \{[\s\S]*?setAlertScenario\(scenario\);[\s\S]*?\}\}[^>]*>[\s\S]*?Ver alertas/,
    "a ação da linha deve selecionar explicitamente o cenário dos alertas",
  );
  expectSource(
    manager,
    /\{scenarioCatalogCertified && alertScenario && alertScenario\.company_id === companyScopeId \? \(\s*<OccupancyScenarioAlertsDialog/,
    "o diálogo deve montar só após seleção e para a empresa ativa",
  );
});

test("diálogo consulta alertas somente para o cenário e empresa selecionados", () => {
  const dialog = readSource(
    "components/app/occupancy-scenario-alerts-dialog.tsx",
  );
  const pathIndex = dialog.indexOf("/occupancy/scenarios/");

  assert.ok(pathIndex >= 0, "o diálogo deve consultar o endpoint de alertas");
  expectSource(
    dialog.slice(pathIndex, pathIndex + 160),
    /^\/occupancy\/scenarios\/\$\{encodeURIComponent\([^)]*\.id\)\}\/alerts/,
    "o identificador do cenário deve ser codificado na rota",
  );
  const request = dialog.slice(Math.max(0, pathIndex - 180), pathIndex + 420);
  expectSource(request, /apiFetch(?:<[^>]+>)?\(/, "diálogo deve usar o cliente autenticado da API");
  expectSource(request, /companyScopeId\s*:/, "requisição deve preservar o escopo da empresa");
  expectSource(request, /signal\s*:/, "requisição deve aceitar cancelamento");
  expectSource(
    dialog,
    /scenario\.company_id !== companyId/,
    "o cenário deve ser conferido contra a empresa antes da consulta",
  );
  const validationIndex = dialog.indexOf("requireOccupancyAlertRows(");
  assert.ok(validationIndex >= 0, "resposta deve usar o validador de alertas");
  expectSource(
    dialog.slice(validationIndex, validationIndex + 220),
    /object_class/,
    "a resposta deve ser certificada contra a classe do cenário",
  );
  assert.doesNotMatch(dialog, /\/api\/v1\/occupancy\/scenarios\//);
});

test("diálogo cancela consultas e distingue carregamento, erro e lista vazia", () => {
  const dialog = readSource(
    "components/app/occupancy-scenario-alerts-dialog.tsx",
  );

  expectSource(dialog, /new AbortController\(/, "consulta deve criar controlador de cancelamento");
  expectSource(
    dialog,
    /(?:\.abort\(|abortRequest\(controller\b)/,
    "diálogo deve cancelar consultas obsoletas",
  );
  expectSource(dialog, /controller\.signal/, "sinal deve acompanhar a consulta");
  expectSource(dialog, /if \(controller\.signal\.aborted\) return;/, "resposta tardia não pode ser publicada");
  expectSource(dialog, /loading|carregando/i, "diálogo deve distinguir carregamento");
  expectSource(dialog, /error|erro/i, "diálogo deve distinguir falha");
  expectSource(dialog, /nenhum alerta|sem alertas/i, "diálogo deve distinguir lista vazia");
  assert.doesNotMatch(dialog, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});

test("contrato dos alertas aceita valores zero e rejeita escopo ou classe divergente", () => {
  const minimum = {
    id: 1,
    object_class: "person",
    scenario_id: "scenario-a",
    threshold_kind: "min",
    threshold_value: 2,
    total_value: 0,
    triggered_at: "2026-09-29T12:00:00Z",
  } as const;
  const maximum = {
    id: 2,
    object_class: "person",
    scenario_id: "scenario-a",
    threshold_kind: "max",
    threshold_value: 10,
    total_value: 12,
    triggered_at: "2026-09-29T13:00:00Z",
  } as const;

  assert.deepEqual(
    requireOccupancyAlertRows({ data: [minimum, maximum] }, "scenario-a", "person"),
    [minimum, maximum],
  );
  assert.throws(
    () => requireOccupancyAlertRows([minimum], "scenario-b", "person"),
    /alerta do cenário/,
  );
  assert.throws(
    () => requireOccupancyAlertRows([minimum], "scenario-a", "vehicle"),
    /alerta da classe/,
  );
});
