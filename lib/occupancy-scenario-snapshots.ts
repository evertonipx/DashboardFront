import type { CertifiedOccupancyCurrentSnapshotRow } from "@/lib/occupancy-validation";
import type {
  OccupancyScenario,
  OccupancyScenarioHistoryResponse,
} from "@/lib/types";

export type OccupancyScenarioSnapshotValue = {
  asOf?: string;
  name: string;
  scenarioId: string;
  total: number;
};

/**
 * Returns whether a certified raw snapshot contains every area configured in
 * the scenario. Coverage is defined exclusively by the stable camera + area
 * identity: object_class is deliberately not part of that identity.
 */
export function occupancyScenarioSnapshotHasCompleteCoverage(
  scenario: OccupancyScenario,
  rows: readonly CertifiedOccupancyCurrentSnapshotRow[],
): boolean {
  if (scenario.areas.length === 0) {
    return false;
  }

  const availableAreas = new Set(
    rows.map((row) => occupancyScenarioAreaKey(row.camera_id, row.area)),
  );

  return scenario.areas.every((area) =>
    availableAreas.has(
      occupancyScenarioAreaKey(area.camera_id, area.area_id),
    ),
  );
}

export function buildOccupancyScenarioSnapshotValue(
  scenario: OccupancyScenario,
  rows: readonly CertifiedOccupancyCurrentSnapshotRow[],
): OccupancyScenarioSnapshotValue {
  if (!scenario.areas.length) {
    throw new Error("O cenário de ocupação não possui áreas configuradas.");
  }

  const rowsByArea = new Map(
    rows
      .map((row) => [
        occupancyScenarioAreaKey(row.camera_id, row.area),
        row,
      ]),
  );
  let total = 0;
  let asOf: string | undefined;

  for (const area of scenario.areas) {
    const row = rowsByArea.get(
      occupancyScenarioAreaKey(area.camera_id, area.area_id),
    );
    if (!row) {
      throw new Error(
        `A leitura atual da área "${area.label || area.area_id}" não está disponível.`,
      );
    }
    total += row.current_value;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
      throw new Error("O total atual do cenário de ocupação é inválido.");
    }
    // A composed total is only as fresh as its oldest contributing area. The
    // endpoint returns one raw timestamp per area, so publishing the newest
    // timestamp would overstate freshness when another area is stale.
    if (!asOf || Date.parse(row.current_at) < Date.parse(asOf)) {
      asOf = row.current_at;
    }
  }

  return {
    asOf,
    name: scenario.name,
    scenarioId: scenario.id,
    total,
  };
}

/**
 * Adapts the latest raw `/occupancy` rows to the scenario history shape used
 * by the focused live dashboard. This keeps every live card on the same
 * camera snapshot while historical/analysis surfaces continue to use the
 * point-in-time scenario endpoint.
 */
export function buildOccupancyScenarioCurrentHistory(
  scenario: OccupancyScenario,
  rows: readonly CertifiedOccupancyCurrentSnapshotRow[],
): OccupancyScenarioHistoryResponse {
  const snapshot = buildOccupancyScenarioSnapshotValue(scenario, rows);
  if (!snapshot.asOf) {
    throw new Error("A leitura atual do cenário de ocupação não possui horário.");
  }

  const rowsByArea = new Map(
    rows
      .map((row) => [
        occupancyScenarioAreaKey(row.camera_id, row.area),
        row,
      ]),
  );

  return {
    areas: scenario.areas.map((area) => {
      const row = rowsByArea.get(
        occupancyScenarioAreaKey(area.camera_id, area.area_id),
      );
      // buildOccupancyScenarioSnapshotValue already certified complete area
      // coverage. Keep this guard local so the adapter remains total even if
      // that implementation changes later.
      if (!row) {
        throw new Error(
          `A leitura atual da área "${area.label || area.area_id}" não está disponível.`,
        );
      }
      return {
        area_id: area.area_id,
        camera_id: area.camera_id,
        snapshot_at: row.current_at,
        value: row.current_value,
      };
    }),
    as_of: snapshot.asOf,
    scenario_id: scenario.id,
    total: snapshot.total,
  };
}

function occupancyScenarioAreaKey(cameraId: string, areaId?: string) {
  return JSON.stringify([cameraId, areaId ?? ""]);
}
