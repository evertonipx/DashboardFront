export const OCCUPANCY_HEX_ZERO_RADIUS_RATIO = 0.24;

export type OccupancyHexVisualState =
  | "occupied"
  | "unoccupied"
  | "unknown"
  | "unavailable"
  | "unlinked";

export type OccupancyHexVisualSource = {
  capacity: number | null;
  cellId: string;
  state: OccupancyHexVisualState;
  total: number | null;
};

export type OccupancyHexVisualEntry = OccupancyHexVisualSource & {
  colorRatio: number | null;
  overCapacity: boolean;
  radiusRatio: number | null;
  valueRatio: number | null;
};

export type OccupancyHexVisualScale = {
  certifiedCount: number;
  certifiedMaximum: number | null;
  domainMaximum: number;
  entries: OccupancyHexVisualEntry[];
};

/**
 * Builds one shared visual domain for an operational hex layout.
 *
 * Only certified totals participate in the domain. A certified zero remains a
 * visible minimum hexagon, while missing and unlinked cells never become zero.
 * Capacity utilization is deliberately kept as its raw ratio so values above
 * the reference capacity remain observable by callers.
 */
export function buildOccupancyHexVisualScale(
  sources: readonly OccupancyHexVisualSource[],
): OccupancyHexVisualScale {
  if (!Array.isArray(sources)) {
    throw new TypeError("As células da escala hexagonal devem formar uma lista.");
  }

  const cellIds = new Set<string>();
  const validated = sources.map((source, index) => {
    validateOccupancyHexVisualSource(source, index, cellIds);
    return source;
  });
  const certifiedTotals = validated.flatMap((source) =>
    source.total === null ? [] : [source.total],
  );
  const certifiedMaximum = certifiedTotals.length
    ? certifiedTotals.reduce((maximum, total) => Math.max(maximum, total), 0)
    : null;
  const domainMaximum = niceOccupancyHexCeiling(certifiedMaximum ?? 0);

  return {
    certifiedCount: certifiedTotals.length,
    certifiedMaximum,
    domainMaximum,
    entries: validated.map((source) => {
      const colorRatio = occupancyHexColorRatio(source.total, source.capacity);
      return {
        ...source,
        colorRatio,
        overCapacity: colorRatio !== null && colorRatio > 1,
        radiusRatio: occupancyHexRadiusRatio(
          source.total,
          domainMaximum,
        ),
        valueRatio:
          source.total === null ? null : source.total / domainMaximum,
      };
    }),
  };
}

/** Returns a deterministic 1/2/5 power-of-ten ceiling, with one as floor. */
export function niceOccupancyHexCeiling(value: number) {
  assertSafeNonNegativeInteger(value, "O máximo certificado da escala");
  if (value <= 1) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const ceiling = step * magnitude;
  if (!Number.isFinite(ceiling) || ceiling < value) {
    throw new RangeError("Não foi possível determinar o teto da escala hexagonal.");
  }
  return ceiling;
}

/**
 * Maps occupancy to radius using log(1 + sqrt(value)), inspired by the
 * official Apache ECharts custom-hexbin example and defined for zero.
 */
export function occupancyHexRadiusRatio(
  total: number | null,
  domainMaximum: number,
) {
  assertFinitePositiveNumber(domainMaximum, "O domínio máximo da escala");
  if (total === null) return null;
  assertSafeNonNegativeInteger(total, "O total certificado da célula");
  if (total > domainMaximum) {
    throw new RangeError(
      "O total certificado não pode exceder o domínio comum da escala.",
    );
  }
  if (total === 0) return OCCUPANCY_HEX_ZERO_RADIUS_RATIO;

  const transformedMaximum = Math.log1p(Math.sqrt(domainMaximum));
  const transformedTotal = Math.log1p(Math.sqrt(total));
  const normalized = transformedTotal / transformedMaximum;
  return (
    OCCUPANCY_HEX_ZERO_RADIUS_RATIO +
    (1 - OCCUPANCY_HEX_ZERO_RADIUS_RATIO) * normalized
  );
}

/** Returns raw utilization only when both a total and a real capacity exist. */
export function occupancyHexColorRatio(
  total: number | null,
  capacity: number | null,
) {
  if (total !== null) {
    assertSafeNonNegativeInteger(total, "O total certificado da célula");
  }
  if (capacity !== null) {
    assertSafePositiveInteger(capacity, "A capacidade de referência da célula");
  }
  if (total === null || capacity === null) return null;
  return total / capacity;
}

function validateOccupancyHexVisualSource(
  source: OccupancyHexVisualSource,
  index: number,
  cellIds: Set<string>,
) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(`A célula hexagonal ${index + 1} é inválida.`);
  }
  if (
    typeof source.cellId !== "string" ||
    !source.cellId.trim() ||
    source.cellId !== source.cellId.trim()
  ) {
    throw new TypeError(`O identificador da célula hexagonal ${index + 1} é inválido.`);
  }
  if (cellIds.has(source.cellId)) {
    throw new RangeError(`O identificador de célula ${source.cellId} está duplicado.`);
  }
  cellIds.add(source.cellId);

  if (
    source.state !== "occupied" &&
    source.state !== "unoccupied" &&
    source.state !== "unknown" &&
    source.state !== "unavailable" &&
    source.state !== "unlinked"
  ) {
    throw new RangeError(`O estado da célula ${source.cellId} é inválido.`);
  }
  if (source.total !== null) {
    assertSafeNonNegativeInteger(
      source.total,
      `O total da célula ${source.cellId}`,
    );
  }
  if (source.capacity !== null) {
    assertSafePositiveInteger(
      source.capacity,
      `A capacidade da célula ${source.cellId}`,
    );
  }

  if (source.state === "occupied" && (source.total === null || source.total === 0)) {
    throw new RangeError(`A célula ocupada ${source.cellId} deve ter total positivo.`);
  }
  if (source.state === "unoccupied" && source.total !== 0) {
    throw new RangeError(`A célula desocupada ${source.cellId} deve ter total zero.`);
  }
  if (source.state === "unknown" && source.total !== null) {
    throw new RangeError(`A célula sem dados ${source.cellId} não pode ter total.`);
  }
  if (
    source.state === "unavailable" &&
    (source.total !== null || source.capacity !== null)
  ) {
    throw new RangeError(
      `A célula com cenário indisponível ${source.cellId} não pode ter total nem capacidade.`,
    );
  }
  if (
    source.state === "unlinked" &&
    (source.total !== null || source.capacity !== null)
  ) {
    throw new RangeError(
      `A célula sem vínculo ${source.cellId} não pode ter total nem capacidade.`,
    );
  }
}

function assertSafeNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} deve ser um inteiro seguro não negativo.`);
  }
}

function assertSafePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} deve ser um inteiro seguro positivo.`);
  }
}

function assertFinitePositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} deve ser um número finito positivo.`);
  }
}
