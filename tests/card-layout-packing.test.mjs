import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cardLayoutPacking = loadTypeScriptModule("lib/card-layout-packing.ts");
const cardLayoutSizing = loadTypeScriptModule("lib/card-layout-sizing.ts");

test("packer denso ocupa uma cavidade anterior e devolve ordem visual", () => {
  const placements = cardLayoutPacking.packCardLayout(
    [
      { columnSpan: 8, id: "a", rowSpan: 12 },
      { columnSpan: 8, id: "b", rowSpan: 6 },
      { columnSpan: 4, id: "c", rowSpan: 6 },
      { columnSpan: 4, id: "d", rowSpan: 6 },
    ],
    12,
  );

  assert.deepEqual(
    placements.map(({ columnStart, id, rowStart, sourceIndex }) => ({
      columnStart,
      id,
      rowStart,
      sourceIndex,
    })),
    [
      { columnStart: 1, id: "a", rowStart: 1, sourceIndex: 0 },
      { columnStart: 9, id: "c", rowStart: 1, sourceIndex: 2 },
      { columnStart: 9, id: "d", rowStart: 7, sourceIndex: 3 },
      { columnStart: 1, id: "b", rowStart: 13, sourceIndex: 1 },
    ],
  );
});

test("packer valida a malha, os identificadores e os spans", () => {
  assert.throws(
    () => cardLayoutPacking.packCardLayout([], 0),
    /columnCount must be a positive safe integer/,
  );
  assert.throws(
    () =>
      cardLayoutPacking.packCardLayout(
        [{ columnSpan: 1, id: "", rowSpan: 1 }],
        12,
      ),
    /id must be a non-empty string/,
  );
  assert.throws(
    () =>
      cardLayoutPacking.packCardLayout(
        [
          { columnSpan: 1, id: "duplicado", rowSpan: 1 },
          { columnSpan: 1, id: "duplicado", rowSpan: 1 },
        ],
        12,
      ),
    /duplicate id/,
  );
  assert.throws(
    () =>
      cardLayoutPacking.packCardLayout(
        [{ columnSpan: 13, id: "largo", rowSpan: 1 }],
        12,
      ),
    /columnSpan cannot exceed columnCount/,
  );
  assert.throws(
    () =>
      cardLayoutPacking.packCardLayout(
        [{ columnSpan: 1, id: "baixo", rowSpan: 0 }],
        12,
      ),
    /rowSpan must be a positive safe integer/,
  );
});

test("packer é determinístico, permanece nos limites e nunca sobrepõe", () => {
  const items = [
    { columnSpan: 9, id: "one", rowSpan: 9 },
    { columnSpan: 8, id: "two", rowSpan: 15 },
    { columnSpan: 3, id: "three", rowSpan: 6 },
    { columnSpan: 4, id: "four", rowSpan: 24 },
    { columnSpan: 6, id: "five", rowSpan: 12 },
    { columnSpan: 3, id: "six", rowSpan: 5 },
  ];

  const first = cardLayoutPacking.packCardLayout(items, 12);
  const second = cardLayoutPacking.packCardLayout(items, 12);
  assert.deepEqual(second, first);
  assertPackingIsValid(first, items, 12);
});

test("packer suporta as 36 dimensões em todos os tiers responsivos", () => {
  for (const tier of ["single", "two-column", "three-column", "desktop"]) {
    const dimensions = cardLayoutSizing.CARD_LAYOUT_LEVELS.flatMap(
      (widthLevel) =>
        cardLayoutSizing.CARD_LAYOUT_LEVELS.map((heightLevel) =>
          cardLayoutSizing.resolveCardLayoutDimensions({
            heightLevel,
            tier,
            widthLevel,
          }),
        ),
    );
    const columnCount = dimensions[0].columnCount;
    const items = dimensions.map((dimension, index) => ({
      columnSpan: dimension.columnSpan,
      id: `${tier}-${index}`,
      rowSpan: dimension.rowSpan,
    }));
    const placements = cardLayoutPacking.packCardLayout(items, columnCount);

    assert.equal(placements.length, 36);
    assertPackingIsValid(placements, items, columnCount);
    for (const placement of placements) {
      const source = items[placement.sourceIndex];
      assert.equal(placement.id, source.id);
      assert.equal(placement.columnSpan, source.columnSpan);
      assert.equal(placement.rowSpan, source.rowSpan);
    }
  }
});

function assertPackingIsValid(placements, sourceItems, columnCount) {
  assert.deepEqual(
    new Set(placements.map((placement) => placement.id)),
    new Set(sourceItems.map((item) => item.id)),
  );
  const occupied = new Set();

  for (const placement of placements) {
    assert.ok(placement.columnStart >= 1);
    assert.ok(placement.rowStart >= 1);
    assert.ok(
      placement.columnStart + placement.columnSpan - 1 <= columnCount,
      `${placement.id} ultrapassou a última coluna`,
    );

    for (
      let row = placement.rowStart;
      row < placement.rowStart + placement.rowSpan;
      row += 1
    ) {
      for (
        let column = placement.columnStart;
        column < placement.columnStart + placement.columnSpan;
        column += 1
      ) {
        const cell = `${row}:${column}`;
        assert.equal(
          occupied.has(cell),
          false,
          `${placement.id} sobrepôs a célula ${cell}`,
        );
        occupied.add(cell);
      }
    }
  }

  const sorted = [...placements].sort(
    (left, right) =>
      left.rowStart - right.rowStart ||
      left.columnStart - right.columnStart ||
      left.sourceIndex - right.sourceIndex,
  );
  assert.deepEqual(placements, sorted, "resultado fora da ordem visual");
}

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    createRequire(filename),
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
