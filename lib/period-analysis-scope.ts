import {
  buildLocationCameraOptions,
  buildSubLocationCameraOptions,
  type CameraGroup,
} from "@/lib/camera-groups";
import type {
  Camera,
  Location,
  Scenario,
  SubLocation,
} from "@/lib/types";

export type PeriodAnalysisScopeMode =
  | "scenario"
  | "location"
  | "sub_location";

export type PeriodAnalysisScopeOption = {
  cameraIds: string[];
  description: string;
  id: string;
  mode: PeriodAnalysisScopeMode;
  name: string;
};

export function buildPeriodAnalysisScopeOptions({
  cameras,
  groups,
  locations,
  manager,
  scenarios,
  subLocations,
}: {
  cameras: Camera[];
  groups: CameraGroup[];
  locations: Location[];
  manager: boolean;
  scenarios: Scenario[];
  subLocations: SubLocation[];
}) {
  const scenarioOptions = scenarios.map<PeriodAnalysisScopeOption>(
    (scenario) => ({
      cameraIds: [],
      description:
        scenario.description || "Cenário personalizado de contagem.",
      id: scenario.id,
      mode: "scenario",
      name: scenario.name,
    }),
  );
  const locationOptions = buildLocationCameraOptions({
    cameras,
    locations,
    manager,
  }).map<PeriodAnalysisScopeOption>((location) => ({
    cameraIds: location.cameraIds,
    description: location.description,
    id: location.id,
    mode: "location",
    name: location.name,
  }));
  const subLocationOptions = buildSubLocationCameraOptions({
    cameras,
    groups,
    locations,
    manager,
    subLocations,
  }).map<PeriodAnalysisScopeOption>((subLocation) => ({
    cameraIds: subLocation.cameraIds,
    description: subLocation.description,
    id: subLocation.id,
    mode: "sub_location",
    name: subLocation.name,
  }));

  return [...scenarioOptions, ...locationOptions, ...subLocationOptions];
}

export function periodAnalysisScopeModeLabel(
  mode: PeriodAnalysisScopeMode,
) {
  if (mode === "location") return "Local";
  if (mode === "sub_location") return "Sublocal";
  return "Cenário";
}

export function periodAnalysisScopeModePluralLabel(
  mode: PeriodAnalysisScopeMode,
) {
  if (mode === "location") return "Locais";
  if (mode === "sub_location") return "Sublocais";
  return "Cenários";
}
