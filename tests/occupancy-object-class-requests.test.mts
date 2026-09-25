import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildOccupancyScenarioSnapshotValue } from "../lib/occupancy-scenario-snapshots.ts";
import { requireOccupancyCurrentSnapshotRows } from "../lib/occupancy-validation.ts";
import type { OccupancyScenario } from "../lib/types.ts";

const projectRoot = resolve(import.meta.dirname, "..");

test("snapshot atual separa classes na mesma câmera e área sem impor person", () => {
  const response = {
    data: [
      {
        area: "fila",
        avg: 2,
        camera_id: "camera-a",
        current_at: "2026-09-18T19:10:00Z",
        current_value: 3,
        min: 1,
        object_class: "vehicle",
        occupied: true,
        peak: 4,
      },
      {
        area: "fila",
        avg: 6,
        camera_id: "camera-a",
        current_at: "2026-09-18T19:10:01Z",
        current_value: 9,
        min: 2,
        object_class: "person",
        occupied: true,
        peak: 10,
      },
    ],
  };
  const vehicleRows = requireOccupancyCurrentSnapshotRows(response, {
    expectedAreas: [
      {
        area_id: "fila",
        camera_id: "camera-a",
        object_class: "vehicle",
      },
    ],
  });
  const personRows = requireOccupancyCurrentSnapshotRows(response, {
    expectedAreas: [
      {
        area_id: "fila",
        camera_id: "camera-a",
        object_class: "person",
      },
    ],
  });
  const bothClasses = requireOccupancyCurrentSnapshotRows(response, {
    expectedAreas: [
      {
        area_id: "fila",
        camera_id: "camera-a",
        object_class: "person",
      },
      {
        area_id: "fila",
        camera_id: "camera-a",
        object_class: "vehicle",
      },
    ],
  });

  const vehicleScenario = {
    active: true,
    areas: [{ area_id: "fila", camera_id: "camera-a", label: "Fila" }],
    company_id: "company-a",
    id: "scenario-a",
    name: "Fila",
    object_class: "vehicle",
  } satisfies OccupancyScenario;
  const personScenario = {
    ...vehicleScenario,
    id: "scenario-b",
    object_class: "person",
  } satisfies OccupancyScenario;

  assert.equal(vehicleRows.length, 1);
  assert.equal(vehicleRows[0].object_class, "vehicle");
  assert.equal(personRows.length, 1);
  assert.equal(personRows[0].object_class, "person");
  assert.deepEqual(
    bothClasses.map((row) => row.object_class).sort(),
    ["person", "vehicle"],
    "classes distintas na mesma câmera e área não podem colidir",
  );
  assert.deepEqual(
    buildOccupancyScenarioSnapshotValue(vehicleScenario, bothClasses),
    {
      asOf: "2026-09-18T19:10:00Z",
      name: "Fila",
      occupied: true,
      scenarioId: "scenario-a",
      total: 3,
    },
  );
  assert.deepEqual(
    buildOccupancyScenarioSnapshotValue(personScenario, bothClasses),
    {
      asOf: "2026-09-18T19:10:01Z",
      name: "Fila",
      occupied: true,
      scenarioId: "scenario-b",
      total: 9,
    },
  );
});

test("consultas raw de ocupacao nunca injetam object_class", () => {
  const liveSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-scenario-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-comparison-widgets.tsx"),
    "utf8",
  );
  const durationSource = readFileSync(
    resolve(projectRoot, "components/app/occupancy-duration-widgets.tsx"),
    "utf8",
  );
  const querySource = readFileSync(
    resolve(projectRoot, "lib/occupancy-dashboard-query.ts"),
    "utf8",
  );
  const liveLoader = liveSource.slice(
    liveSource.indexOf("async function loadFocusedLiveSnapshot"),
    liveSource.indexOf("function buildOccupancyChartState"),
  );
  const snapshotQuery = querySource.slice(
    querySource.indexOf("export function occupancyLiveSnapshotQuery"),
    querySource.indexOf("export function mergeOccupancyCardDemand"),
  );

  assert.match(liveLoader, /object_class:\s*scenario\.object_class/);
  assert.doesNotMatch(snapshotQuery, /object_class/);
  assert.doesNotMatch(comparisonSource, /scenariosByObjectClass/);
  assert.match(comparisonSource, /object_class:\s*scenario\.object_class/);
  assert.match(durationSource, /object_class:\s*scenario\.object_class/);
  assert.match(
    comparisonSource,
    /scenarioId: OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID/,
  );
});
