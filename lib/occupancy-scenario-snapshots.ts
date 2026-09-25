import type { CertifiedOccupancyCurrentSnapshotRow } from "@/lib/occupancy-validation";
import type {
  OccupancyScenario,
  OccupancyScenarioHistoryResponse,
} from "@/lib/types";

export type OccupancyScenarioSnapshotValue = {
  asOf?: string;
  name: string;
  occupied: boolean;
  scenarioId: string;
  total: number;
};

/**
 * Returns whether a certified raw snapshot contains every area configured in
 * the scenario. Coverage follows the backend grouping identity exactly:
 * camera + area + object_class.
 */
export function occupancyScenarioSnapshotHasCompleteCoverage(
  scenario: OccupancyScenario,
  rows: readonly CertifiedOccupancyCurrentSnapshotRow[],
): boolean {
  if (scenario.areas.length === 0) {
    return false;
  }

  const availableAreas = new Set(
    rows.map((row) =>
      occupancyScenarioAreaKey(
        row.camera_id,
        row.area,
        row.object_class,
      ),
    ),
  );

  return scenario.areas.every((area) =>
    availableAreas.has(
      occupancyScenarioAreaKey(
        area.camera_id,
        area.area_id,
        scenario.object_class,
      ),
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
        occupancyScenarioAreaKey(
          row.camera_id,
          row.area,
          row.object_class,
        ),
        row,
      ]),
  );
  let total = 0;
  let occupied = false;
  let asOf: string | undefined;

  for (const area of scenario.areas) {
    const row = rowsByArea.get(
      occupancyScenarioAreaKey(
        area.camera_id,
        area.area_id,
        scenario.object_class,
      ),
    );
    if (!row) {
      throw new Error(
        `A leitura atual da área "${area.label || area.area_id}" não está disponível.`,
      );
    }
    total += row.current_value;
    occupied ||= row.occupied;
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
    occupied,
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
        occupancyScenarioAreaKey(
          row.camera_id,
          row.area,
          row.object_class,
        ),
        row,
      ]),
  );

  return {
    areas: scenario.areas.map((area) => {
      const row = rowsByArea.get(
        occupancyScenarioAreaKey(
          area.camera_id,
          area.area_id,
          scenario.object_class,
        ),
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
        occupied: row.occupied,
        snapshot_at: row.current_at,
        value: row.current_value,
      };
    }),
    as_of: snapshot.asOf,
    occupied: snapshot.occupied,
    scenario_id: scenario.id,
    total: snapshot.total,
  };
}

/**
 * Carries a previously certified per-area snapshot forward with the raw
 * readings returned by the current `/occupancy` pulse.
 *
 * The current endpoint deliberately omits areas that had no event inside the
 * requested window. An omitted area is therefore not zero and it is not an
 * invalid reading: its last certified value must be retained. A raw row only
 * replaces the cached area when its timestamp is at least as recent as the
 * cached snapshot. Returning `null` forces the caller to bootstrap the cache
 * from `/occupancy/scenarios/{id}/history` when the scenario configuration
 * changed or no complete baseline exists yet.
 */
export function mergeOccupancyScenarioCurrentHistory(
  scenario: OccupancyScenario,
  previous: OccupancyScenarioHistoryResponse | null | undefined,
  rows: readonly CertifiedOccupancyCurrentSnapshotRow[],
): OccupancyScenarioHistoryResponse | null {
  const previousAreas = previous?.areas;
  if (
    !previous ||
    previous.scenario_id !== scenario.id ||
    !Array.isArray(previousAreas) ||
    !scenario.areas.length
  ) {
    return null;
  }

  const previousByArea = new Map(
    previousAreas.map((area) => [
      occupancyScenarioAreaKey(area.camera_id, area.area_id, scenario.object_class),
      area,
    ]),
  );
  const currentByArea = new Map(
    rows.map((row) => [
      occupancyScenarioAreaKey(row.camera_id, row.area, row.object_class),
      row,
    ]),
  );
  const areas: Array<{
    area_id: string;
    camera_id: string;
    occupied: boolean;
    snapshot_at: string;
    value: number;
  }> = scenario.areas.flatMap((area) => {
    const key = occupancyScenarioAreaKey(
      area.camera_id,
      area.area_id,
      scenario.object_class,
    );
    const cached = previousByArea.get(key);
    if (!cached?.snapshot_at) return [];
    const current = currentByArea.get(key);
    const currentAt = current ? Date.parse(current.current_at) : Number.NaN;
    const cachedAt = Date.parse(cached.snapshot_at);
    if (current && Number.isFinite(currentAt) && currentAt >= cachedAt) {
      return [{
        area_id: area.area_id,
        camera_id: area.camera_id,
        occupied: current.occupied,
        snapshot_at: current.current_at,
        value: current.current_value,
      }];
    }
    return [{
      area_id: area.area_id,
      camera_id: area.camera_id,
      occupied: cached.value > 0,
      snapshot_at: cached.snapshot_at,
      value: cached.value,
    }];
  });

  if (areas.length !== scenario.areas.length) return null;
  const total = areas.reduce((sum, area) => sum + area.value, 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError("O total atual do cenário de ocupação é inválido.");
  }
  const oldestSnapshot = areas.reduce<string | null>((oldest, area) => {
    if (!oldest || Date.parse(area.snapshot_at) < Date.parse(oldest)) {
      return area.snapshot_at;
    }
    return oldest;
  }, null);
  if (!oldestSnapshot) return null;

  return {
    areas,
    as_of: oldestSnapshot,
    occupied: areas.some((area) => area.value > 0),
    scenario_id: scenario.id,
    total,
  };
}

function occupancyScenarioAreaKey(
  cameraId: string,
  areaId: string | undefined,
  objectClass: string,
) {
  return JSON.stringify([cameraId, areaId ?? "", objectClass]);
}
