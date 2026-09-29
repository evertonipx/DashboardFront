import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_OCCUPANCY_ALERT_NOTIFICATION_IDS_PER_SCOPE,
  MAX_OCCUPANCY_ALERT_NOTIFICATION_SCOPES,
  OCCUPANCY_ALERT_NOTIFICATION_WINDOW_MS,
  reconcileOccupancyAlertNotifications,
} from "../lib/occupancy-alert-notifications.ts";
import type { OccupancyAlertRow } from "../lib/types.ts";

const NOW_MS = Date.parse("2026-09-29T15:00:00.000Z");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function alertRow(
  id: number,
  triggeredAtMs = NOW_MS,
): OccupancyAlertRow {
  return {
    id,
    object_class: "person",
    scenario_id: "scenario-a",
    threshold_kind: "max",
    threshold_value: 10,
    total_value: 11,
    triggered_at: new Date(triggeredAtMs).toISOString(),
  };
}

test("a primeira resposta do escopo estabelece uma base silenciosa", () => {
  const seen = new Map<string, Set<number>>();
  const initial = [alertRow(1), alertRow(2)];

  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, "company-a/scenario-a", initial, NOW_MS),
    [],
  );
  assert.deepEqual([...seen.get("company-a/scenario-a")!], [1, 2]);
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, "company-a/scenario-a", initial, NOW_MS),
    [],
  );
});

test("notifica apenas IDs novos uma vez, inclusive em lote duplicado ou reordenado", () => {
  const seen = new Map<string, Set<number>>();
  const scope = "company-a/scenario-a";
  reconcileOccupancyAlertNotifications(seen, scope, [alertRow(1)], NOW_MS);

  assert.deepEqual(
    reconcileOccupancyAlertNotifications(
      seen,
      scope,
      [alertRow(2), alertRow(1), alertRow(2), alertRow(3)],
      NOW_MS,
    ).map((row) => row.id),
    [2, 3],
  );
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(
      seen,
      scope,
      [alertRow(3), alertRow(2), alertRow(1)],
      NOW_MS,
    ),
    [],
  );
});

test("empresa e cenário diferentes têm bases independentes", () => {
  const seen = new Map<string, Set<number>>();
  const scopeA = "company-a/scenario-a";
  const scopeB = "company-b/scenario-a";
  const scopeC = "company-a/scenario-b";

  reconcileOccupancyAlertNotifications(seen, scopeA, [alertRow(1)], NOW_MS);
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, scopeB, [alertRow(2)], NOW_MS),
    [],
  );
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, scopeC, [alertRow(2)], NOW_MS),
    [],
  );
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, scopeA, [alertRow(1), alertRow(2)], NOW_MS)
      .map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, scopeB, [alertRow(2)], NOW_MS),
    [],
  );
});

test("base inicial vazia permite o primeiro alerta posterior", () => {
  const seen = new Map<string, Set<number>>();
  const scope = "company-a/scenario-a";

  assert.deepEqual(reconcileOccupancyAlertNotifications(seen, scope, [], NOW_MS), []);
  assert.equal(seen.has(scope), true);
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, scope, [alertRow(5)], NOW_MS)
      .map((row) => row.id),
    [5],
  );
});

test("somente timestamps válidos nos últimos cinco minutos notificam", () => {
  const seen = new Map<string, Set<number>>();
  const scope = "company-a/scenario-a";
  reconcileOccupancyAlertNotifications(seen, scope, [], NOW_MS);
  const tooOld = alertRow(1, NOW_MS - OCCUPANCY_ALERT_NOTIFICATION_WINDOW_MS - 1);
  const boundary = alertRow(2, NOW_MS - OCCUPANCY_ALERT_NOTIFICATION_WINDOW_MS);
  const current = alertRow(3);
  const future = alertRow(4, NOW_MS + 1);
  const invalid = { ...alertRow(5), triggered_at: "invalid" };

  assert.deepEqual(
    reconcileOccupancyAlertNotifications(
      seen,
      scope,
      [tooOld, boundary, current, future, invalid],
      NOW_MS,
    ).map((row) => row.id),
    [2, 3],
  );
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, scope, [tooOld, future, invalid], NOW_MS),
    [],
  );
  assert.deepEqual([...seen.get(scope)!].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("limita a memória de IDs por escopo e preserva os observados recentemente", () => {
  const seen = new Map<string, Set<number>>();
  const scope = "company-a/scenario-a";
  const capacity = MAX_OCCUPANCY_ALERT_NOTIFICATION_IDS_PER_SCOPE;
  const batch = Array.from({ length: capacity + 10 }, (_, id) => alertRow(id));

  reconcileOccupancyAlertNotifications(seen, scope, batch, NOW_MS);
  assert.equal(seen.get(scope)?.size, capacity);
  assert.equal(seen.get(scope)?.has(0), false);
  assert.equal(seen.get(scope)?.has(10), true);

  reconcileOccupancyAlertNotifications(seen, scope, [alertRow(10), alertRow(capacity + 10)], NOW_MS);
  assert.equal(seen.get(scope)?.size, capacity);
  assert.equal(seen.get(scope)?.has(10), true);
  assert.equal(seen.get(scope)?.has(11), false);
});

test("limita escopos e descarta o menos recentemente consultado", () => {
  const seen = new Map<string, Set<number>>();
  for (let index = 0; index < MAX_OCCUPANCY_ALERT_NOTIFICATION_SCOPES; index += 1) {
    reconcileOccupancyAlertNotifications(seen, `scope-${index}`, [], NOW_MS);
  }

  reconcileOccupancyAlertNotifications(seen, "scope-0", [], NOW_MS);
  reconcileOccupancyAlertNotifications(seen, "scope-new", [alertRow(99)], NOW_MS);

  assert.equal(seen.size, MAX_OCCUPANCY_ALERT_NOTIFICATION_SCOPES);
  assert.equal(seen.has("scope-0"), true);
  assert.equal(seen.has("scope-1"), false);
  assert.equal(seen.has("scope-new"), true);
  // A discarded scope is treated as a fresh baseline, never as a burst.
  assert.deepEqual(
    reconcileOccupancyAlertNotifications(seen, "scope-1", [alertRow(1)], NOW_MS),
    [],
  );
});

test("Ao Vivo notifica somente alertas novos da resposta certificada e atual", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const alertPath =
    "path: `/occupancy/scenarios/${encodeURIComponent(scenario.id)}/alerts?limit=12`";
  const requestIndex = source.indexOf(alertPath);
  const validationIndex = source.indexOf("data: requireOccupancyAlertRows(", requestIndex);
  const currentGuardIndex = source.indexOf("if (!isCurrentRequest()) return;", validationIndex);
  const successIndex = source.indexOf("if (alertResult.succeeded)", currentGuardIndex);
  const reconciliationIndex = source.indexOf(
    "const newAlerts = reconcileOccupancyAlertNotifications(",
    successIndex,
  );
  const publicationIndex = source.indexOf("setAlerts(alertResult.data)", reconciliationIndex);

  assert.ok(requestIndex >= 0, "a consulta de alertas existente deve continuar no Ao Vivo");
  assert.ok(validationIndex > requestIndex, "a resposta deve ser certificada antes do uso");
  assert.ok(currentGuardIndex > validationIndex, "a resposta obsoleta não pode notificar");
  assert.ok(successIndex > currentGuardIndex, "a falha não deve atualizar o histórico de avisos");
  assert.ok(reconciliationIndex > successIndex, "somente sucesso atual deve ser reconciliado");
  assert.ok(publicationIndex > reconciliationIndex, "a reconciliação usa a resposta publicada");
  assert.match(
    source.slice(requestIndex - 130, requestIndex),
    /fetchSharedOccupancyQuery<unknown>\(\{/,
    "o aviso deve aproveitar a mesma consulta de alertas",
  );
  assert.equal(
    (source.match(/\/occupancy\/scenarios\/[^`\r\n]*\/alerts/g) ?? []).length,
    1,
    "não deve haver GET adicional para gerar notificações",
  );

  const notificationBlock = source.slice(reconciliationIndex, publicationIndex);
  assert.match(notificationBlock, /alertResult\.data,\s*Date\.now\(\)/);
  assert.match(
    notificationBlock,
    /if \(newAlerts\.length && document\.visibilityState === "visible"\)/,
    "a primeira resposta silenciosa não pode exibir toast pelo tamanho do lote bruto",
  );
  assert.equal(
    (notificationBlock.match(/\btoast\(/g) ?? []).length,
    1,
    "um lote de novos alertas deve produzir um único toast agregado",
  );
  assert.match(notificationBlock, /newAlerts\.length === 1[\s\S]*?\$\{newAlerts\.length\} novos alertas de ocupação/);
});
