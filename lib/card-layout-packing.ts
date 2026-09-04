export type CardLayoutPackingItem = {
  columnSpan: number;
  id: string;
  rowSpan: number;
};

export type CardLayoutPlacement = CardLayoutPackingItem & {
  /** One-based CSS Grid column where the widget starts. */
  columnStart: number;
  /** Original priority in the configured widget order. */
  sourceIndex: number;
  /** One-based CSS Grid row where the widget starts. */
  rowStart: number;
};

/**
 * Places every widget in the first free rectangle that can contain it.
 *
 * Every item starts its search at the beginning of the grid, which makes the
 * algorithm dense without relying on CSS `grid-auto-flow: dense`. Placements
 * are returned in visual row/column order so callers can keep DOM, keyboard
 * and screen-reader order aligned with the rendered layout.
 */
export function packCardLayout(
  items: readonly CardLayoutPackingItem[],
  columnCount: number,
): CardLayoutPlacement[] {
  assertPositiveSafeInteger(columnCount, "columnCount");
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }

  const occupiedRows: Uint8Array[] = [];
  const ids = new Set<string>();
  const placements = items.map((item, sourceIndex) => {
    validateItem(item, sourceIndex, columnCount, ids);
    const position = findFirstAvailablePosition(
      occupiedRows,
      columnCount,
      item.columnSpan,
      item.rowSpan,
    );
    occupy(
      occupiedRows,
      columnCount,
      position.columnStart,
      position.rowStart,
      item.columnSpan,
      item.rowSpan,
    );

    return {
      columnSpan: item.columnSpan,
      columnStart: position.columnStart + 1,
      id: item.id,
      rowSpan: item.rowSpan,
      rowStart: position.rowStart + 1,
      sourceIndex,
    };
  });

  return placements.sort(comparePlacementsByVisualOrder);
}

function validateItem(
  item: CardLayoutPackingItem,
  sourceIndex: number,
  columnCount: number,
  ids: Set<string>,
) {
  if (!item || typeof item !== "object") {
    throw new TypeError(`items[${sourceIndex}] must be an object`);
  }
  if (typeof item.id !== "string" || !item.id.trim()) {
    throw new TypeError(`items[${sourceIndex}].id must be a non-empty string`);
  }
  if (ids.has(item.id)) {
    throw new RangeError(`items contains duplicate id "${item.id}"`);
  }
  ids.add(item.id);

  assertPositiveSafeInteger(
    item.columnSpan,
    `items[${sourceIndex}].columnSpan`,
  );
  if (item.columnSpan > columnCount) {
    throw new RangeError(
      `items[${sourceIndex}].columnSpan cannot exceed columnCount`,
    );
  }
  assertPositiveSafeInteger(item.rowSpan, `items[${sourceIndex}].rowSpan`);
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function findFirstAvailablePosition(
  occupiedRows: readonly Uint8Array[],
  columnCount: number,
  columnSpan: number,
  rowSpan: number,
) {
  for (let rowStart = 0; ; rowStart += 1) {
    for (
      let columnStart = 0;
      columnStart <= columnCount - columnSpan;
      columnStart += 1
    ) {
      if (
        rectangleIsAvailable(
          occupiedRows,
          columnStart,
          rowStart,
          columnSpan,
          rowSpan,
        )
      ) {
        return { columnStart, rowStart };
      }
    }
  }
}

function rectangleIsAvailable(
  occupiedRows: readonly Uint8Array[],
  columnStart: number,
  rowStart: number,
  columnSpan: number,
  rowSpan: number,
) {
  const columnEnd = columnStart + columnSpan;
  const rowEnd = rowStart + rowSpan;

  for (let rowIndex = rowStart; rowIndex < rowEnd; rowIndex += 1) {
    const row = occupiedRows[rowIndex];
    if (!row) continue;
    for (
      let columnIndex = columnStart;
      columnIndex < columnEnd;
      columnIndex += 1
    ) {
      if (row[columnIndex]) return false;
    }
  }
  return true;
}

function occupy(
  occupiedRows: Uint8Array[],
  columnCount: number,
  columnStart: number,
  rowStart: number,
  columnSpan: number,
  rowSpan: number,
) {
  const columnEnd = columnStart + columnSpan;
  const rowEnd = rowStart + rowSpan;

  for (let rowIndex = rowStart; rowIndex < rowEnd; rowIndex += 1) {
    const row =
      occupiedRows[rowIndex] ??
      (occupiedRows[rowIndex] = new Uint8Array(columnCount));
    row.fill(1, columnStart, columnEnd);
  }
}

function comparePlacementsByVisualOrder(
  left: CardLayoutPlacement,
  right: CardLayoutPlacement,
) {
  return (
    left.rowStart - right.rowStart ||
    left.columnStart - right.columnStart ||
    left.sourceIndex - right.sourceIndex
  );
}
