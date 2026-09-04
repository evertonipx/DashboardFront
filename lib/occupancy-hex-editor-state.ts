import type {
  OccupancyHexLayout,
  OccupancyHexLayoutCell,
} from "@/lib/occupancy-hex-layout";

export const OCCUPANCY_HEX_EDITOR_HISTORY_LIMIT = 50;
export const OCCUPANCY_HEX_EDITOR_MAX_CAPACITY = 1_000_000;

export type OccupancyHexEditorDocument = {
  capacities: Record<string, number>;
  layout: OccupancyHexLayout;
};

export type OccupancyHexEditorState = {
  baseline: OccupancyHexEditorDocument;
  future: OccupancyHexEditorDocument[];
  past: OccupancyHexEditorDocument[];
  present: OccupancyHexEditorDocument;
};

export type OccupancyHexEditorAction =
  | { document: OccupancyHexEditorDocument; type: "commit" }
  | { document: OccupancyHexEditorDocument; type: "reset" }
  | { type: "redo" }
  | { type: "undo" };

export type OccupancyHexEditorValidationCode =
  | "duplicate-cell-id"
  | "duplicate-coordinate"
  | "duplicate-scenario"
  | "cell-out-of-grid"
  | "invalid-capacity"
  | "unlinked-cell"
  | "unavailable-scenario";

export type OccupancyHexEditorValidationIssue = {
  cellId?: string;
  code: OccupancyHexEditorValidationCode;
  column?: number;
  message: string;
  row?: number;
  scenarioId?: string;
  severity: "error" | "warning";
};

export type OccupancyHexEditorValidationResult = {
  errors: OccupancyHexEditorValidationIssue[];
  valid: boolean;
  warnings: OccupancyHexEditorValidationIssue[];
};

export type OccupancyHexEditorValidationOptions = {
  availableScenarioIds?: Iterable<string>;
};

export function createOccupancyHexEditorState(
  document: OccupancyHexEditorDocument,
): OccupancyHexEditorState {
  return {
    baseline: cloneOccupancyHexEditorDocument(document),
    future: [],
    past: [],
    present: cloneOccupancyHexEditorDocument(document),
  };
}

export function occupancyHexEditorReducer(
  state: OccupancyHexEditorState,
  action: OccupancyHexEditorAction,
): OccupancyHexEditorState {
  switch (action.type) {
    case "commit":
      return commitOccupancyHexEditorDocument(state, action.document);
    case "reset":
      return resetOccupancyHexEditorDocument(action.document);
    case "redo":
      return redoOccupancyHexEditorDocument(state);
    case "undo":
      return undoOccupancyHexEditorDocument(state);
  }
}

export function commitOccupancyHexEditorDocument(
  state: OccupancyHexEditorState,
  document: OccupancyHexEditorDocument,
): OccupancyHexEditorState {
  if (areOccupancyHexEditorDocumentsEqual(state.present, document)) return state;

  return {
    ...state,
    future: [],
    past: appendBoundedHistory(state.past, state.present),
    present: cloneOccupancyHexEditorDocument(document),
  };
}

export function resetOccupancyHexEditorDocument(
  document: OccupancyHexEditorDocument,
): OccupancyHexEditorState {
  return createOccupancyHexEditorState(document);
}

export function undoOccupancyHexEditorDocument(
  state: OccupancyHexEditorState,
): OccupancyHexEditorState {
  const previous = state.past.at(-1);
  if (!previous) return state;

  return {
    ...state,
    future: [
      cloneOccupancyHexEditorDocument(state.present),
      ...state.future,
    ].slice(0, OCCUPANCY_HEX_EDITOR_HISTORY_LIMIT),
    past: state.past.slice(0, -1),
    present: cloneOccupancyHexEditorDocument(previous),
  };
}

export function redoOccupancyHexEditorDocument(
  state: OccupancyHexEditorState,
): OccupancyHexEditorState {
  const [next, ...remainingFuture] = state.future;
  if (!next) return state;

  return {
    ...state,
    future: remainingFuture,
    past: appendBoundedHistory(state.past, state.present),
    present: cloneOccupancyHexEditorDocument(next),
  };
}

export function isOccupancyHexEditorStateDirty(
  state: OccupancyHexEditorState,
) {
  return !areOccupancyHexEditorDocumentsEqual(state.baseline, state.present);
}

export function cloneOccupancyHexEditorDocument(
  document: OccupancyHexEditorDocument,
): OccupancyHexEditorDocument {
  return {
    capacities: Object.fromEntries(
      Object.keys(document.capacities).map((scenarioId) => [
        scenarioId,
        document.capacities[scenarioId],
      ]),
    ),
    layout: {
      cells: document.layout.cells.map(cloneCell),
      columns: document.layout.columns,
      preset: document.layout.preset,
      rows: document.layout.rows,
      version: document.layout.version,
    },
  };
}

export function areOccupancyHexEditorDocumentsEqual(
  left: OccupancyHexEditorDocument,
  right: OccupancyHexEditorDocument,
) {
  if (
    left.layout.columns !== right.layout.columns ||
    left.layout.preset !== right.layout.preset ||
    left.layout.rows !== right.layout.rows ||
    left.layout.version !== right.layout.version ||
    left.layout.cells.length !== right.layout.cells.length
  ) {
    return false;
  }

  for (let index = 0; index < left.layout.cells.length; index += 1) {
    const leftCell = left.layout.cells[index];
    const rightCell = right.layout.cells[index];
    if (
      leftCell.column !== rightCell.column ||
      leftCell.id !== rightCell.id ||
      leftCell.label !== rightCell.label ||
      leftCell.row !== rightCell.row ||
      leftCell.scenarioId !== rightCell.scenarioId
    ) {
      return false;
    }
  }

  const leftCapacityKeys = Object.keys(left.capacities).sort();
  const rightCapacityKeys = Object.keys(right.capacities).sort();
  if (leftCapacityKeys.length !== rightCapacityKeys.length) return false;

  return leftCapacityKeys.every(
    (scenarioId, index) =>
      scenarioId === rightCapacityKeys[index] &&
      Object.is(left.capacities[scenarioId], right.capacities[scenarioId]),
  );
}

export function validateOccupancyHexEditorDocument(
  document: OccupancyHexEditorDocument,
  options: OccupancyHexEditorValidationOptions = {},
): OccupancyHexEditorValidationResult {
  const errors: OccupancyHexEditorValidationIssue[] = [];
  const warnings: OccupancyHexEditorValidationIssue[] = [];
  const cellIds = new Set<string>();
  const coordinates = new Set<string>();
  const scenarioIds = new Set<string>();
  const availableScenarioIds =
    options.availableScenarioIds === undefined
      ? null
      : new Set(options.availableScenarioIds);

  document.layout.cells.forEach((cell) => {
    if (cellIds.has(cell.id)) {
      errors.push({
        cellId: cell.id,
        code: "duplicate-cell-id",
        message: "O layout contém uma célula duplicada. Remova-a antes de salvar.",
        severity: "error",
      });
    } else {
      cellIds.add(cell.id);
    }

    const integerCoordinate =
      Number.isSafeInteger(cell.column) && Number.isSafeInteger(cell.row);
    const coordinate = `${cell.column}:${cell.row}`;
    if (integerCoordinate && coordinates.has(coordinate)) {
      errors.push({
        cellId: cell.id,
        code: "duplicate-coordinate",
        column: cell.column,
        message: `Mais de uma célula ocupa a linha ${cell.row + 1}, coluna ${cell.column + 1}.`,
        row: cell.row,
        severity: "error",
      });
    } else if (integerCoordinate) {
      coordinates.add(coordinate);
    }

    if (!isCellInsideGrid(cell, document.layout)) {
      errors.push({
        cellId: cell.id,
        code: "cell-out-of-grid",
        column: cell.column,
        message: "Há uma célula fora dos limites do layout.",
        row: cell.row,
        severity: "error",
      });
    }

    if (!cell.scenarioId) {
      warnings.push({
        cellId: cell.id,
        code: "unlinked-cell",
        message: "Há uma célula sem cenário vinculado.",
        severity: "warning",
      });
      return;
    }

    if (scenarioIds.has(cell.scenarioId)) {
      errors.push({
        cellId: cell.id,
        code: "duplicate-scenario",
        message: "Um cenário está vinculado a mais de uma célula.",
        scenarioId: cell.scenarioId,
        severity: "error",
      });
    } else {
      scenarioIds.add(cell.scenarioId);
    }

    if (
      availableScenarioIds !== null &&
      !availableScenarioIds.has(cell.scenarioId)
    ) {
      warnings.push({
        cellId: cell.id,
        code: "unavailable-scenario",
        message: "Uma célula está vinculada a um cenário indisponível para esta seleção.",
        scenarioId: cell.scenarioId,
        severity: "warning",
      });
    }
  });

  Object.keys(document.capacities)
    .sort()
    .forEach((scenarioId) => {
      const capacity = document.capacities[scenarioId];
      if (
        Number.isSafeInteger(capacity) &&
        capacity > 0 &&
        capacity <= OCCUPANCY_HEX_EDITOR_MAX_CAPACITY
      ) {
        return;
      }
      errors.push({
        code: "invalid-capacity",
        message: `Há uma capacidade inválida. Informe um número inteiro entre 1 e ${OCCUPANCY_HEX_EDITOR_MAX_CAPACITY}.`,
        scenarioId,
        severity: "error",
      });
    });

  return {
    errors,
    valid: errors.length === 0,
    warnings,
  };
}

function appendBoundedHistory(
  history: OccupancyHexEditorDocument[],
  document: OccupancyHexEditorDocument,
) {
  return [...history, cloneOccupancyHexEditorDocument(document)].slice(
    -OCCUPANCY_HEX_EDITOR_HISTORY_LIMIT,
  );
}

function cloneCell(cell: OccupancyHexLayoutCell): OccupancyHexLayoutCell {
  return {
    column: cell.column,
    id: cell.id,
    label: cell.label,
    row: cell.row,
    scenarioId: cell.scenarioId,
  };
}

function isCellInsideGrid(
  cell: OccupancyHexLayoutCell,
  layout: OccupancyHexLayout,
) {
  return (
    Number.isSafeInteger(cell.column) &&
    Number.isSafeInteger(cell.row) &&
    cell.column >= 0 &&
    cell.column < layout.columns &&
    cell.row >= 0 &&
    cell.row < layout.rows
  );
}
