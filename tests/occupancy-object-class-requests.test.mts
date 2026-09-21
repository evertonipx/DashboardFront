import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildOccupancyScenarioSnapshotValue } from "../lib/occupancy-scenario-snapshots.ts";
import { requireOccupancyCurrentSnapshotRows } from "../lib/occupancy-validation.ts";
import type { OccupancyScenario } from "../lib/types.ts";

const projectRoot = resolve(import.meta.dirname, "..");

test("snapshots atuais usam a identidade da area sem impor person", () => {
  const rows = requireOccupancyCurrentSnapshotRows(
    {
      data: [
        {
          area: "fila",
          camera_id: "camera-a",
          current_at: "2026-09-18T19:10:00Z",
          current_value: 3,
          object_class: "vehicle",
        },
      ],
    },
    {
      expectedAreas: [{ area_id: "fila", camera_id: "camera-a" }],
    },
  );

  const staleScenario = {
    active: true,
    areas: [{ area_id: "fila", camera_id: "camera-a", label: "Fila" }],
    company_id: "company-a",
    id: "scenario-a",
    name: "Fila",
    object_class: "person",
  } satisfies OccupancyScenario;

  assert.equal(rows[0].object_class, "vehicle");
  assert.equal(buildOccupancyScenarioSnapshotValue(staleScenario, rows).total, 3);
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

  assert.doesNotMatch(liveLoader, /object_class/);
  assert.doesNotMatch(snapshotQuery, /object_class/);
  assert.doesNotMatch(comparisonSource, /scenariosByObjectClass/);
  assert.match(
    comparisonSource,
    /scenarioId: OCCUPANCY_LIVE_SNAPSHOT_QUERY_ID/,
  );
});
