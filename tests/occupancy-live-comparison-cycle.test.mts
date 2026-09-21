import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOccupancyHalfDonutEntries,
  buildOccupancyLiveRaceEntries,
} from "../lib/occupancy-comparison.ts";
import {
  buildOccupancyComparisonSelectionPlan,
  resolveOccupancyComparisonInheritedScenarioIds,
} from "../lib/occupancy-comparison-selection.ts";
import { buildOccupancyCardDemandKey } from "../lib/occupancy-dashboard-query.ts";
import { buildOccupancyScenarioSnapshotValue } from "../lib/occupancy-scenario-snapshots.ts";
import type { CertifiedOccupancyCurrentSnapshotRow } from "../lib/occupancy-validation.ts";
import type { OccupancyScenario } from "../lib/types.ts";
import type { CardPreference } from "../lib/view-preferences.ts";

const COMPARISON_CARD_ID = "occupancy_scenario_half_donut";
const RANKING_CARD_ID = "occupancy_scenario_bar_race";

const scenarios: OccupancyScenario[] = [
  scenario("scenario-a", "Entrada", "camera-a", "area-a", true),
  scenario("scenario-b", "Praça", "camera-b", "area-b", true),
  scenario("scenario-disabled", "Inativo", "camera-c", "area-c", false),
];

const preferences: CardPreference[] = [
  preference(COMPARISON_CARD_ID),
  preference(RANKING_CARD_ID),
];

test("demanda de cada comparativo preserva todos os cenários ativos", () => {
  const inheritedScenarioIds =
    resolveOccupancyComparisonInheritedScenarioIds({
      configuredScenarioIds: [],
      focusScenarioId: "scenario-a",
      scenarios,
    });

  assert.deepEqual(inheritedScenarioIds, ["scenario-a", "scenario-b"]);

  for (const demandedCardId of [COMPARISON_CARD_ID, RANKING_CARD_ID]) {
    const demandKey = buildOccupancyCardDemandKey({
      materializedCardIds: [demandedCardId],
      preferences,
    });
    const requestedCardIds = new Set(demandKey.split("|").filter(Boolean));
    const requestedPreferences = preferences.filter((candidate) =>
      requestedCardIds.has(candidate.id),
    );
    const plan = buildOccupancyComparisonSelectionPlan({
      hexScenarioIds: [],
      inheritedHeatmapScenarioId: "scenario-a",
      inheritedScenarioIds,
      preferences: requestedPreferences,
      scenarios,
    });

    assert.deepEqual(
      plan.snapshots,
      ["scenario-a", "scenario-b"],
      `${demandedCardId} deve solicitar os dois cenários ativos`,
    );
  }
});

test("dois pulsos de snapshot atualizam comparação e ranking sem perder zero certificado", () => {
  const firstPulse = comparisonModels([
    row("camera-a", "area-a", 0),
    row("camera-b", "area-b", 2),
  ]);
  const secondPulse = comparisonModels([
    row("camera-a", "area-a", 4),
    row("camera-b", "area-b", 1),
  ]);

  assert.deepEqual(
    firstPulse.comparison.map(({ scenarioId, total }) => [scenarioId, total]),
    [
      ["scenario-a", 0],
      ["scenario-b", 2],
    ],
  );
  assert.deepEqual(
    firstPulse.ranking.map(({ scenarioId, value }) => [scenarioId, value]),
    [
      ["scenario-a", 0],
      ["scenario-b", 2],
    ],
  );
  assert.deepEqual(
    secondPulse.comparison.map(({ scenarioId, total }) => [scenarioId, total]),
    [
      ["scenario-a", 4],
      ["scenario-b", 1],
    ],
  );
  assert.deepEqual(
    secondPulse.ranking.map(({ scenarioId, value }) => [scenarioId, value]),
    [
      ["scenario-a", 4],
      ["scenario-b", 1],
    ],
  );
});

function comparisonModels(rows: CertifiedOccupancyCurrentSnapshotRow[]) {
  const snapshots = scenarios
    .filter((candidate) => candidate.active)
    .map((candidate) =>
      buildOccupancyScenarioSnapshotValue(candidate, rows),
    );
  return {
    comparison: buildOccupancyHalfDonutEntries(snapshots, "actual"),
    ranking: buildOccupancyLiveRaceEntries(snapshots),
  };
}

function scenario(
  id: string,
  name: string,
  cameraId: string,
  areaId: string,
  active: boolean,
): OccupancyScenario {
  return {
    active,
    areas: [{ area_id: areaId, camera_id: cameraId }],
    company_id: "company-a",
    id,
    name,
    object_class: "person",
  };
}

function preference(id: string): CardPreference {
  return {
    height: "standard",
    id,
    size: "wide",
    visible: true,
  };
}

function row(
  cameraId: string,
  area: string,
  currentValue: number,
): CertifiedOccupancyCurrentSnapshotRow {
  return {
    area,
    avg: currentValue,
    camera_id: cameraId,
    current_at: "2026-09-17T18:00:00Z",
    current_value: currentValue,
    min: currentValue,
    object_class: "person",
    peak: currentValue,
  };
}
