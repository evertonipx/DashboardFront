import type { OccupancyAreaOption } from "@/lib/occupancy-areas";
import type { OccupancyScenarioArea } from "@/lib/types";

export function occupancyScenarioObjectClassOptions(
  areaOptions: readonly OccupancyAreaOption[],
  currentObjectClass?: string | null,
) {
  const classes: string[] = [];
  const seen = new Set<string>();

  function append(value?: string | null) {
    const objectClass = value?.trim();
    if (!objectClass || seen.has(objectClass)) return;
    seen.add(objectClass);
    classes.push(objectClass);
  }

  append(currentObjectClass);
  areaOptions.forEach((option) => append(option.object_class));

  return classes;
}

export function initialOccupancyScenarioObjectClass(
  areaOptions: readonly OccupancyAreaOption[],
  authoritative: boolean,
) {
  if (!authoritative) return "";

  for (const option of areaOptions) {
    const objectClass = option.object_class?.trim();
    if (objectClass) return objectClass;
  }

  return "";
}

export function retainAreasCompatibleWithObjectClass(
  areas: readonly OccupancyScenarioArea[],
  objectClass: string,
  areaOptions: readonly OccupancyAreaOption[],
) {
  const expectedClass = objectClass.trim();

  return areas.filter((area) => {
    const candidates = areaOptions.filter(
      (option) =>
        option.area_id === area.area_id &&
        option.camera_id === area.camera_id,
    );

    // A non-authoritative fallback catalogue may not know an existing area.
    // Preserve it unless the catalogue positively certifies a different class.
    return (
      candidates.length === 0 ||
      candidates.some((option) => {
        const candidateClass = option.object_class?.trim();
        return !candidateClass || candidateClass === expectedClass;
      })
    );
  });
}
