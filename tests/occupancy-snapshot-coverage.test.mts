import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeOccupancyScenarioCurrentHistory,
  occupancyScenarioSnapshotHasCompleteCoverage,
} from "../lib/occupancy-scenario-snapshots.ts";
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
    avg: 1,
    camera_id: cameraId,
    current_at: "2026-09-18T19:30:00Z",
    current_value: 1,
    min: 1,
    object_class: objectClass,
    occupied: true,
    peak: 1,
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

test("rejeita cobertura composta por classe diferente da configurada", () => {
  assert.equal(
    occupancyScenarioSnapshotHasCompleteCoverage(scenario, [
      snapshotRow("camera-a", "entrada", "vehicle"),
      snapshotRow("camera-b", "espera", "vehicle"),
    ]),
    false,
  );
});

test("ignora classe extra e certifica somente a tríplice esperada", () => {
  assert.equal(
    occupancyScenarioSnapshotHasCompleteCoverage(scenario, [
      snapshotRow("camera-a", "entrada", "vehicle"),
      snapshotRow("camera-a", "entrada"),
      snapshotRow("camera-b", "espera", "vehicle"),
      snapshotRow("camera-b", "espera"),
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

test("mescla pulso parcial com a base histórica sem transformar área quieta em zero", () => {
  const merged = mergeOccupancyScenarioCurrentHistory(
    scenario,
    {
      areas: [
        {
          area_id: "entrada",
          camera_id: "camera-a",
          snapshot_at: "2026-09-18T19:20:00Z",
          value: 2,
        },
        {
          area_id: "espera",
          camera_id: "camera-b",
          snapshot_at: "2026-09-18T19:21:00Z",
          value: 4,
        },
      ],
      as_of: "2026-09-18T19:21:00Z",
      scenario_id: scenario.id,
      total: 6,
    },
    [{
      ...snapshotRow("camera-a", "entrada"),
      current_value: 3,
    }],
  );

  assert.ok(merged);
  assert.equal(merged.total, 7);
  assert.equal(merged.occupied, true);
  assert.equal(merged.as_of, "2026-09-18T19:21:00Z");
  assert.deepEqual(
    merged.areas?.map(({ area_id, value }) => [area_id, value]),
    [["entrada", 3], ["espera", 4]],
  );
});

test("não reutiliza base incompleta nem deixa pulso antigo regredir a leitura", () => {
  const incomplete = mergeOccupancyScenarioCurrentHistory(
    scenario,
    {
      areas: [{
        area_id: "entrada",
        camera_id: "camera-a",
        snapshot_at: "2026-09-18T19:20:00Z",
        value: 2,
      }],
      scenario_id: scenario.id,
      total: 2,
    },
    [],
  );
  assert.equal(incomplete, null);

  const merged = mergeOccupancyScenarioCurrentHistory(
    scenario,
    {
      areas: [
        {
          area_id: "entrada",
          camera_id: "camera-a",
          snapshot_at: "2026-09-18T19:40:00Z",
          value: 5,
        },
        {
          area_id: "espera",
          camera_id: "camera-b",
          snapshot_at: "2026-09-18T19:40:00Z",
          value: 1,
        },
      ],
      scenario_id: scenario.id,
      total: 6,
    },
    [{
      ...snapshotRow("camera-a", "entrada"),
      current_at: "2026-09-18T19:30:00Z",
      current_value: 0,
      occupied: false,
    }],
  );
  assert.equal(merged?.total, 6);
  assert.equal(merged?.areas?.[0]?.value, 5);
});
