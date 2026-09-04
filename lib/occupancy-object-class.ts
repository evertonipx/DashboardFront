const OCCUPANCY_OBJECT_CLASS_LABELS: Readonly<Record<string, string>> = {
  bicycle: "Bicicletas",
  bus: "Ônibus",
  car: "Veículos",
  motorcycle: "Motocicletas",
  pedestrian: "Pessoas",
  people: "Pessoas",
  person: "Pessoas",
  truck: "Caminhões",
  vehicle: "Veículos",
};

export function occupancyObjectClassLabel(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "Pessoas";
  return OCCUPANCY_OBJECT_CLASS_LABELS[normalized] ?? "Objetos monitorados";
}
