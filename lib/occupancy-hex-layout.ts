export const OCCUPANCY_HEX_MIN_COLUMNS = 1;
export const OCCUPANCY_HEX_MAX_COLUMNS = 32;
export const OCCUPANCY_HEX_MAX_ROWS = 64;
export const OCCUPANCY_HEX_MAX_CELLS = 500;

export type OccupancyHexDensity = "comfortable" | "compact" | "dense";

export type OccupancyHexBulkLayoutResult = {
  added: number;
  layout: OccupancyHexLayout;
  requested: number;
};

export type OccupancyHexScenarioBindingResult = {
  bound: number;
  created: number;
  layout: OccupancyHexLayout;
  skipped: number;
};

export type OccupancyHexViewportMetrics = {
  density: OccupancyHexDensity;
  height: number;
  minimumWidth: number;
  showNames: boolean;
  showValues: boolean;
};

export type OccupancyLayoutPreset =
  | "queue"
  | "showcase"
  | "workstation"
  | "custom";

export type OccupancyHexLayoutCell = {
  column: number;
  id: string;
  label: string;
  row: number;
  scenarioId: string | null;
};

export type OccupancyHexLayout = {
  cells: OccupancyHexLayoutCell[];
  columns: number;
  preset: OccupancyLayoutPreset;
  rows: number;
  version: 1;
};

export function normalizeOccupancyHexLayout(
  value: unknown,
): OccupancyHexLayout | null {
  if (!isRecord(value) || !Array.isArray(value.cells)) return null;
  if (value.cells.length > OCCUPANCY_HEX_MAX_CELLS) return null;

  const columns = normalizeColumns(value.columns);
  const requestedRows = normalizeRows(value.rows);
  const preset = normalizeOccupancyLayoutPreset(value.preset);
  const ids = new Set<string>();
  const scenarioIds = new Set<string>();
  const cells: OccupancyHexLayoutCell[] = [];

  value.cells.forEach((candidate, index) => {
    if (!isRecord(candidate)) return;
    const fallbackId = `cell-${index + 1}`;
    let id = normalizeText(candidate.id, 80) || fallbackId;
    while (ids.has(id)) id = `${fallbackId}-${ids.size + 1}`;
    ids.add(id);

    let scenarioId = normalizeNullableId(candidate.scenarioId);
    if (scenarioId && scenarioIds.has(scenarioId)) scenarioId = null;
    if (scenarioId) scenarioIds.add(scenarioId);

    cells.push({
      column: normalizeCoordinate(candidate.column),
      id,
      label: normalizeText(candidate.label, 80),
      row: normalizeCoordinate(candidate.row),
      scenarioId,
    });
  });

  return reflowOccupancyHexLayout({
    cells,
    columns,
    preset,
    rows: requestedRows,
    version: 1,
  });
}

export function createDefaultOccupancyHexLayout({
  columns = 4,
  preset = "queue",
  scenarioIds,
}: {
  columns?: number;
  preset?: OccupancyLayoutPreset;
  scenarioIds: readonly string[];
}): OccupancyHexLayout {
  const normalizedColumns = normalizeColumns(columns);
  const uniqueScenarioIds = Array.from(
    new Set(
      scenarioIds
        .map((scenarioId) => normalizeNullableId(scenarioId))
        .filter((scenarioId): scenarioId is string => Boolean(scenarioId)),
    ),
  ).slice(0, OCCUPANCY_HEX_MAX_CELLS);
  const usableColumns =
    preset === "workstation"
      ? Math.max(
          1,
          Array.from(
            { length: normalizedColumns },
            (_, column) => column,
          ).filter((column) => (column + 1) % 3 !== 0).length,
        )
      : normalizedColumns;
  const rows = Math.max(1, Math.ceil(uniqueScenarioIds.length / usableColumns));
  const layout: OccupancyHexLayout = {
    cells: uniqueScenarioIds.map((scenarioId, index) => ({
      column: index % normalizedColumns,
      id: `scenario-${scenarioId}`,
      label: "",
      row: Math.floor(index / normalizedColumns),
      scenarioId,
    })),
    columns: normalizedColumns,
    preset,
    rows,
    version: 1,
  };
  return arrangeOccupancyHexLayout(layout, preset);
}

/**
 * Expands a layout up to an exact total without ever removing existing cells.
 * The operation is deterministic, preserves bindings/labels and is intended to
 * be committed as a single editor history transaction even for hundreds of
 * operational positions.
 */
export function expandOccupancyHexLayout({
  columns,
  labelPrefix = "Posição",
  layout,
  targetCellCount,
}: {
  columns: number;
  labelPrefix?: string;
  layout: OccupancyHexLayout;
  targetCellCount: number;
}): OccupancyHexBulkLayoutResult {
  if (
    !Number.isSafeInteger(targetCellCount) ||
    targetCellCount < 1 ||
    targetCellCount > OCCUPANCY_HEX_MAX_CELLS
  ) {
    throw new RangeError(
      `O total do layout deve estar entre 1 e ${OCCUPANCY_HEX_MAX_CELLS}.`,
    );
  }

  const requestedColumns = normalizeColumns(columns);
  const safeTarget = Math.max(layout.cells.length, targetCellCount);
  const plannedColumns = Math.min(
    OCCUPANCY_HEX_MAX_COLUMNS,
    Math.max(
      requestedColumns,
      Math.ceil(safeTarget / OCCUPANCY_HEX_MAX_ROWS),
    ),
  );
  const plannedRows = Math.min(
    OCCUPANCY_HEX_MAX_ROWS,
    Math.max(1, Math.ceil(safeTarget / plannedColumns)),
  );
  const base = reflowOccupancyHexLayout(layout, {
    columns: plannedColumns,
    rows: plannedRows,
  });
  const cells = base.cells.map((cell) => ({ ...cell }));
  const occupied = new Set(
    cells.map((cell) => coordinateKey(cell.column, cell.row)),
  );
  const ids = new Set(cells.map((cell) => cell.id));
  const normalizedPrefix = normalizeText(labelPrefix, 60) || "Posição";
  const digitCount = Math.max(2, String(targetCellCount).length);
  const slots = listGridSlots(base.columns, base.rows);
  let slotIndex = 0;

  while (cells.length < targetCellCount) {
    while (
      slotIndex < slots.length &&
      occupied.has(coordinateKey(slots[slotIndex].column, slots[slotIndex].row))
    ) {
      slotIndex += 1;
    }
    const slot = slots[slotIndex];
    if (!slot) break;
    const ordinal = cells.length + 1;
    const id = nextBulkCellId(ids, ordinal);
    ids.add(id);
    occupied.add(coordinateKey(slot.column, slot.row));
    cells.push({
      column: slot.column,
      id,
      label: `${normalizedPrefix} ${String(ordinal).padStart(digitCount, "0")}`,
      row: slot.row,
      scenarioId: null,
    });
    slotIndex += 1;
  }

  return {
    added: cells.length - layout.cells.length,
    layout: {
      ...base,
      cells,
      preset: cells.length === layout.cells.length ? base.preset : "custom",
    },
    requested: targetCellCount,
  };
}

/**
 * Binds scenarios in bulk, consuming reserved cells before growing the grid.
 * Existing bindings are never displaced and repeated scenario ids are ignored.
 */
export function bindOccupancyHexScenariosToAvailableCells({
  layout,
  scenarioIds,
}: {
  layout: OccupancyHexLayout;
  scenarioIds: readonly string[];
}): OccupancyHexScenarioBindingResult {
  const alreadyBound = new Set(
    layout.cells.flatMap((cell) => (cell.scenarioId ? [cell.scenarioId] : [])),
  );
  const requested = Array.from(
    new Set(
      scenarioIds.filter(
        (scenarioId) =>
          typeof scenarioId === "string" &&
          scenarioId.trim() === scenarioId &&
          Boolean(scenarioId) &&
          !alreadyBound.has(scenarioId),
      ),
    ),
  );
  const maximumBindings = Math.min(
    requested.length,
    OCCUPANCY_HEX_MAX_CELLS - alreadyBound.size,
  );
  const scenarioIdsToBind = requested.slice(0, maximumBindings);
  const requiredCellCount = Math.min(
    OCCUPANCY_HEX_MAX_CELLS,
    Math.max(
      layout.cells.length,
      layout.cells.filter((cell) => Boolean(cell.scenarioId)).length +
        scenarioIdsToBind.length,
    ),
  );
  const expanded =
    requiredCellCount > layout.cells.length
      ? expandOccupancyHexLayout({
          columns: layout.columns,
          labelPrefix: "Posição",
          layout,
          targetCellCount: requiredCellCount,
        })
      : { added: 0, layout };
  let bindingIndex = 0;
  const cells = expanded.layout.cells.map((cell) => {
    if (cell.scenarioId || bindingIndex >= scenarioIdsToBind.length) {
      return { ...cell };
    }
    const scenarioId = scenarioIdsToBind[bindingIndex];
    bindingIndex += 1;
    return { ...cell, scenarioId };
  });

  return {
    bound: bindingIndex,
    created: expanded.added,
    layout: { ...expanded.layout, cells },
    skipped: requested.length - bindingIndex,
  };
}

export function recommendedOccupancyHexColumns(cellCount: number) {
  if (!Number.isSafeInteger(cellCount) || cellCount < 1) return 4;
  return Math.min(
    OCCUPANCY_HEX_MAX_COLUMNS,
    Math.max(
      OCCUPANCY_HEX_MIN_COLUMNS,
      Math.ceil(Math.sqrt(Math.min(cellCount, OCCUPANCY_HEX_MAX_CELLS) * 1.4)),
    ),
  );
}

/** Keeps large charts readable without producing multi-thousand-pixel cards. */
export function occupancyHexViewportMetrics({
  cellCount,
  columns,
  rows,
}: {
  cellCount: number;
  columns: number;
  rows: number;
}): OccupancyHexViewportMetrics {
  const density: OccupancyHexDensity =
    cellCount > 200 ? "dense" : cellCount > 72 ? "compact" : "comfortable";
  const cellWidth =
    density === "comfortable" ? 76 : density === "compact" ? 60 : 48;
  const rowHeight =
    density === "comfortable" ? 72 : density === "compact" ? 58 : 46;

  return {
    density,
    height: Math.max(390, Math.min(1_200, rows * rowHeight + 32)),
    minimumWidth: Math.max(360, Math.min(1_900, columns * cellWidth + 32)),
    showNames: cellCount <= 120,
    showValues: cellCount <= OCCUPANCY_HEX_MAX_CELLS,
  };
}

export function occupancyHexShouldAnimate(cellCount: number) {
  return cellCount <= 120;
}

export function reflowOccupancyHexLayout(
  layout: OccupancyHexLayout,
  dimensions: { columns?: number; rows?: number } = {},
): OccupancyHexLayout {
  const requestedColumns = normalizeColumns(
    dimensions.columns ?? layout.columns,
  );
  const columns = Math.min(
    OCCUPANCY_HEX_MAX_COLUMNS,
    Math.max(
      requestedColumns,
      Math.ceil(
        Math.min(layout.cells.length, OCCUPANCY_HEX_MAX_CELLS) /
          OCCUPANCY_HEX_MAX_ROWS,
      ),
    ),
  );
  const minimumRows = Math.max(
    1,
    Math.ceil(Math.min(layout.cells.length, OCCUPANCY_HEX_MAX_CELLS) / columns),
  );
  const rows = Math.min(
    OCCUPANCY_HEX_MAX_ROWS,
    Math.max(minimumRows, normalizeRows(dimensions.rows ?? layout.rows)),
  );
  const availableSlots = listGridSlots(columns, rows);
  const used = new Set<string>();
  const pending: OccupancyHexLayoutCell[] = [];
  const cells = layout.cells
    .slice(0, Math.min(OCCUPANCY_HEX_MAX_CELLS, availableSlots.length))
    .map((cell) => {
      const key = coordinateKey(cell.column, cell.row);
      if (
        cell.column >= 0 &&
        cell.column < columns &&
        cell.row >= 0 &&
        cell.row < rows &&
        !used.has(key)
      ) {
        used.add(key);
        return { ...cell };
      }
      const copy = { ...cell };
      pending.push(copy);
      return copy;
    });

  const freeSlots = availableSlots.filter(
    (slot) => !used.has(coordinateKey(slot.column, slot.row)),
  );
  pending.forEach((cell, index) => {
    const slot = freeSlots[index];
    if (!slot) return;
    cell.column = slot.column;
    cell.row = slot.row;
  });

  return {
    cells,
    columns,
    preset: normalizeOccupancyLayoutPreset(layout.preset),
    rows,
    version: 1,
  };
}

export function arrangeOccupancyHexLayout(
  layout: OccupancyHexLayout,
  preset: OccupancyLayoutPreset,
): OccupancyHexLayout {
  const normalizedPreset = normalizeOccupancyLayoutPreset(preset);
  const requiredRows =
    normalizedPreset === "workstation"
      ? Math.max(
          layout.rows,
          Math.ceil(
            layout.cells.length /
              Math.max(
                1,
                Array.from(
                  { length: layout.columns },
                  (_, column) => column,
                ).filter((column) => (column + 1) % 3 !== 0).length,
              ),
          ),
        )
      : layout.rows;
  const base = reflowOccupancyHexLayout(layout, { rows: requiredRows });
  const slots = presetSlots(base.columns, base.rows, normalizedPreset);
  return {
    ...base,
    cells: base.cells.map((cell, index) => ({
      ...cell,
      column: slots[index]?.column ?? cell.column,
      row: slots[index]?.row ?? cell.row,
    })),
    preset: normalizedPreset,
  };
}

export function moveOccupancyHexCell(
  layout: OccupancyHexLayout,
  cellId: string,
  column: number,
  row: number,
): OccupancyHexLayout {
  if (
    !Number.isSafeInteger(column) ||
    !Number.isSafeInteger(row) ||
    column < 0 ||
    column >= layout.columns ||
    row < 0 ||
    row >= layout.rows
  ) {
    return layout;
  }
  const source = layout.cells.find((cell) => cell.id === cellId);
  if (!source || (source.column === column && source.row === row)) return layout;
  const target = layout.cells.find(
    (cell) => cell.column === column && cell.row === row,
  );

  return {
    ...layout,
    cells: layout.cells.map((cell) => {
      if (cell.id === source.id) return { ...cell, column, row };
      if (target && cell.id === target.id) {
        return { ...cell, column: source.column, row: source.row };
      }
      return cell;
    }),
    preset: "custom",
  };
}

export function normalizeOccupancyLayoutPreset(
  value: unknown,
): OccupancyLayoutPreset {
  if (
    value === "showcase" ||
    value === "workstation" ||
    value === "custom"
  ) {
    return value;
  }
  return "queue";
}

function presetSlots(
  columns: number,
  rows: number,
  preset: OccupancyLayoutPreset,
) {
  const slots = listGridSlots(columns, rows);
  if (preset === "queue") {
    return slots.sort((left, right) => {
      if (left.row !== right.row) return left.row - right.row;
      return left.row % 2 === 0
        ? left.column - right.column
        : right.column - left.column;
    });
  }
  if (preset === "showcase") {
    const center = (columns - 1) / 2;
    return slots.sort(
      (left, right) =>
        left.row - right.row ||
        Math.abs(left.column - center) - Math.abs(right.column - center) ||
        left.column - right.column,
    );
  }
  if (preset === "workstation") {
    return slots.sort(
      (left, right) =>
        Number((left.column + 1) % 3 === 0) -
          Number((right.column + 1) % 3 === 0) ||
        left.row - right.row ||
        left.column - right.column,
    );
  }
  return slots;
}

function listGridSlots(columns: number, rows: number) {
  return Array.from({ length: columns * rows }, (_, index) => ({
    column: index % columns,
    row: Math.floor(index / columns),
  }));
}

function coordinateKey(column: number, row: number) {
  return `${column}:${row}`;
}

function nextBulkCellId(ids: ReadonlySet<string>, ordinal: number) {
  const base = `cell-bulk-${ordinal}`;
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function normalizeColumns(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= OCCUPANCY_HEX_MIN_COLUMNS &&
    value <= OCCUPANCY_HEX_MAX_COLUMNS
    ? value
    : 4;
}

function normalizeRows(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= OCCUPANCY_HEX_MAX_ROWS
    ? value
    : 1;
}

function normalizeCoordinate(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < OCCUPANCY_HEX_MAX_ROWS
    ? value
    : 0;
}

function normalizeNullableId(value: unknown) {
  return typeof value === "string" && value.trim() === value && value
    ? value
    : null;
}

function normalizeText(value: unknown, maximumLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maximumLength)
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
