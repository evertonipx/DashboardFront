import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const comparisonFile = "components/app/occupancy-comparison-widgets.tsx";
const palette = {
  surfaces: Object.fromEntries(["occupied", "unoccupied", "unknown", "unavailable", "unlinked"].map((state) => [state, { fill: "#ffffff", border: "#444444" }])),
  outerShadow: "#222222", selectedBorder: "#111111", labelHalo: "#ffffff",
  tooltipBackground: "#ffffff", tooltipBorder: "#444444", tooltipText: "#111111",
};
const valueLabel = standalone(comparisonFile, "hexPositionValueLabel", { formatChartNumber: String });
const visualBindings = {
  occupancyHexDisplayRadiusRatio: () => 0.5,
  occupancyHexValueColor: () => "#2255aa",
  occupancyHexTextColor: () => "#111111",
};
const buildHexOption = standalone(comparisonFile, "buildHexLayoutOption", {
  ...visualBindings,
  occupancyHexStateLineDash: () => undefined,
  hexagonPoints: standalone(comparisonFile, "hexagonPoints"),
  truncateLabel: (value) => value,
  hexPositionValueLabel: valueLabel,
  formatChartNumber: String,
  occupancyStateLabel: (value) => value,
  escapeTooltip: String,
});

test("hexágono zero mantém célula, polígonos, nome, dado e tooltip; só omite cell-value", () => {
  const zero = hexFixture(0);
  const positive = hexFixture(7);
  assert.deepEqual(zero.option.series[0].data[0].value, [0, 0, 0]);
  assert.equal(zero.option.series[0].data.length, 1);
  assert.equal(zero.rendered.id, "cell-a");
  assert.equal(zero.rendered.children.filter((child) => child.type === "polygon").length, 2);
  assert.equal(zero.rendered.children.find((child) => child.name === "cell-name").style.text, "Sala 00");
  assert.equal(zero.rendered.children.some((child) => child.name === "cell-value"), false);
  assert.equal(positive.rendered.children.find((child) => child.name === "cell-value").style.text, "7");
  assert.deepEqual(
    zero.rendered.children.filter((child) => child.type === "polygon").map((child) => child.shape),
    positive.rendered.children.filter((child) => child.type === "polygon").map((child) => child.shape),
  );
  assert.match(zero.option.tooltip.formatter({ dataIndex: 0 }), /Ocupação disponível: 0/);
});

test("hexágonos preservam estado semântico, ausência de dados e valores não zero", () => {
  const status = hexFixture(0, "status");
  assert.equal(status.rendered.children.find((child) => child.name === "cell-value").style.text, "DESOCUPADO");
  const unknown = hexFixture(null, "actual", "unknown");
  assert.equal(unknown.rendered.children.find((child) => child.name === "cell-value").style.text, "SEM DADOS");
  const fractional = hexFixture(0.01);
  assert.equal(fractional.rendered.children.find((child) => child.name === "cell-value").style.text, "0.01");
  const negativeZero = hexFixture(-0);
  assert.equal(negativeZero.rendered.children.some((child) => child.name === "cell-value"), false);
});

test("duração zero omite somente texto, mantendo o intervalo e sua geometria", () => {
  const createRenderer = standalone("components/app/occupancy-duration-widgets.tsx", "durationTimelineRenderItem", {
    numericValue: (value) => typeof value === "number" && Number.isFinite(value) ? value : null,
    formatOccupancyDuration: (seconds) => `${seconds}s`,
  });
  const render = createRenderer({ color: "#2255aa", border: "#113366", text: "#ffffff" }, "occupied");
  const draw = (seconds) => render({ coordSys: { x: 0, y: 0, width: 120, height: 60 } }, {
    value: (dimension) => [0, 0, 100, seconds][dimension],
    coord: ([value]) => [value, 30], size: () => [100, 30],
  });
  const zero = draw(0);
  const nonzero = draw(45);
  assert.equal(zero.type, "group");
  assert.equal(zero.children.length, 1);
  assert.equal(zero.children[0].type, "rect");
  assert.deepEqual(zero.children[0], nonzero.children[0]);
  assert.equal(nonzero.children[1].style.text, "45s");
  assert.equal(draw(0.01).children[1].style.text, "0.01s");
});

test("prévia HTML do editor conserva SVG e descrição acessível com zero", () => {
  const editor = standalone("components/app/occupancy-hex-layout-editor.tsx", "HexEditorCell", {
    ...visualBindings, React,
    editorCellState: (_cell, _scenario, total) => total === null ? "unknown" : total > 0 ? "occupied" : "unoccupied",
    editorCellStatus: (_state, total) => total === null ? "sem dados" : `ocupação ${total}`,
    formatNumber: String,
    cn: (...values) => values.filter(Boolean).join(" "),
  });
  const render = (total, displayMode = "actual") => renderToStaticMarkup(editor({
    cell: { id: "cell-a", column: 0, row: 0, label: "Sala 00", scenarioId: "scenario-a" },
    displayMode, moving: false, onMove() {}, onNavigate() {}, onSelect() {},
    palette, scale: 1, scenario: { id: "scenario-a", name: "Sala 00" },
    selected: true, showDetails: true, total,
  }));
  const zero = render(0);
  const positive = render(7);
  assert.equal(zero.match(/<polygon\b/g)?.length, 2);
  assert.equal(zero.match(/<polygon\b/g)?.length, positive.match(/<polygon\b/g)?.length);
  assert.match(zero, /aria-label="Sala 00; linha 1, coluna 1; ocupação 0"/);
  assert.match(zero, /<span class="block truncate">Sala 00<\/span>/);
  assert.doesNotMatch(zero, /mt-1 block text-\[11px\] font-extrabold/);
  assert.match(positive, /font-extrabold">7<\/span>/);
  assert.match(render(0, "status"), />DESOCUPADO<\/span>/);
  assert.match(render(null), />SEM DADOS<\/span>/);
});

function hexFixture(total, displayMode = "actual", state = total > 0 ? "occupied" : "unoccupied") {
  const position = { cellId: "cell-a", x: 0, y: 0, row: 0, column: 0, name: "Sala 00", state, total, capacity: null };
  const option = buildHexOption([position], { domainMaximum: 10, entries: [{ cellId: position.cellId, colorRatio: null, overCapacity: false }] }, palette, {
    animate: false, displayMode, semanticLabel: "Estado", showNames: true, showValues: true,
  });
  const rendered = option.series[0].renderItem({ dataIndex: 0 }, { coord: () => [80, 80], size: () => [120, 120] });
  return { option, rendered };
}

function standalone(relativePath, name, bindings = {}) {
  const filename = resolve(root, relativePath);
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${name} deve existir`);
  const output = ts.transpileModule(`${declaration.getText(source)}\nmodule.exports = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", ...Object.keys(bindings), output)(loaded, loaded.exports, ...Object.values(bindings));
  return loaded.exports;
}
