import assert from "node:assert/strict";
import test from "node:test";

import { occupancyScenarioSnapshotHasCompleteCoverage } from "../lib/occupancy-scenario-snapshots.ts";
import type { CertifiedOccupancyCurrentSnapshotRow } from "../lib/occupancy-validation.ts";
import type { OccupancyScenario } from "../lib/types.ts";

const scenario = {
  active: true,
  areas: [
    { area_id: "entrada", camera_id: "camera-a", label: "Entrada" },
    { area_id: "espera", camera_id: "camera-b", label: "Espera" },
  ],
  company_id: "company-a",
  id: "scenario-a",
  name: "Operação",
  object_class: "person",
} satisfies OccupancyScenario;

function snapshotRow(
  cameraId: string,
  areaId: string,
  objectClass = "person",
): CertifiedOccupancyCurrentSnapshotRow {
  return {
    area: areaId,
    camera_id: cameraId,
    current_at: "2026-09-18T19:30:00Z",
    current_value: 1,
    object_class: objectClass,
  };
}

test("reconhece cobertura completa de todas as áreas do cenário", () => {
  assert.equal(
    occupancyScenarioSnapshotHasCompleteCoverage(scenario, [
      snapshotRow("camera-a", "entrada"),
      snapshotRow("camera-b", "espera"),
    ]),
    true,
  );
});

test("rejeita cobertura parcial do cenário", () => {
  assert.equal(
    occupancyScenarioSnapshotHasCompleteCoverage(scenario, [
      snapshotRow("camera-a", "entrada"),
    ]),
    false,
  );
});

test("rejeita cenário sem áreas mesmo quando existem leituras", () => {
  assert.equal(
    occupancyScenarioSnapshotHasCompleteCoverage(
      { ...scenario, areas: [] },
      [snapshotRow("camera-a", "entrada")],
    ),
    false,
  );
});

test("usa camera e área como identidade mesmo com object_class divergente", () => {
  assert.equal(
    occupancyScenarioSnapshotHasCompleteCoverage(scenario, [
      snapshotRow("camera-a", "entrada", "vehicle"),
      snapshotRow("camera-b", "espera", "vehicle"),
    ]),
    true,
  );
});

test("aceita leituras extras quando todas as áreas esperadas estão presentes", () => {
  assert.equal(
    occupancyScenarioSnapshotHasCompleteCoverage(scenario, [
      snapshotRow("camera-extra", "externa"),
      snapshotRow("camera-a", "entrada"),
      snapshotRow("camera-b", "espera"),
    ]),
    true,
  );
});
