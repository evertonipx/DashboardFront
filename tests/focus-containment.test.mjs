import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync("tools/verify-responsive.mjs", "utf8");
const parsed = ts.createSourceFile("verify-responsive.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declaration = parsed.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "focusPaintOutsets");
assert.ok(declaration, "o auditor precisa medir pintura além do border-box");
const focusPaintOutsets = vm.runInNewContext(`(${declaration.getText(parsed)})`);
const outsets = (...args) => ({ ...focusPaintOutsets(...args) });
const empty = { top: 0, right: 0, bottom: 0, left: 0 };

test("o contorno antigo de 2px mais offset 2px pinta 4px além do campo", () => {
  assert.deepEqual(outsets("rgb(255, 255, 255) 0px 0px 0px 2px, rgb(18, 103, 196) 0px 0px 0px 4px"), {
    top: 4, right: 4, bottom: 4, left: 4,
  });
});

test("ring interno não aumenta os limites pintados do campo", () => {
  assert.deepEqual(outsets("rgb(255, 255, 255) 0px 0px 0px 0px inset, rgb(18, 103, 196) 0px 0px 0px 2px inset"), empty);
});

test("separa sombras compostas sem confundir vírgulas dos canais de cor", () => {
  assert.deepEqual(outsets("rgba(0, 0, 0, 0) 0px 0px 0px 8px, rgba(0, 0, 0, 0.05) 0px 1px 2px 0px"), {
    top: 1, right: 2, bottom: 3, left: 2,
  });
});

test("outline transparente do Tailwind não gera falso extravasamento", () => {
  assert.deepEqual(outsets("none", "2px", "2px", "solid", "rgba(0, 0, 0, 0)"), empty);
  assert.deepEqual(outsets("none", "2px", "2px", "solid", "transparent"), empty);
});

test("alto contraste usa outline interno visível sem sair das margens", () => {
  assert.deepEqual(outsets("none", "2px", "-2px", "solid", "rgb(0, 0, 0)"), empty);
  assert.deepEqual(outsets("none", "2px", "2px", "solid", "rgb(0, 0, 0)"), {
    top: 4, right: 4, bottom: 4, left: 4,
  });
});

test("sombras negativas mantêm limites assimétricos sem valores negativos", () => {
  assert.deepEqual(outsets("rgb(18, 103, 196) -3px -1px 0px 2px"), {
    top: 3, right: 0, bottom: 1, left: 5,
  });
});

test("fixture testa eventos reais e estilos dos componentes, inclusive foco no indicador do checkbox", () => {
  for (const component of ["input", "textarea", "select", "button", "tabs", "checkbox"]) {
    assert.ok(source.includes(`@/components/ui/${component}`));
  }
  assert.match(source, /\["keyboard", "pointer"\]/);
  assert.match(source, /key\("Tab", "Tab", 9\)/);
  assert.match(source, /Emulation\.setEmulatedMedia/);
  assert.match(source, /getComputedStyle\(paint\)/);
  assert.match(source, /\[data-checkbox-indicator\]/);
  assert.match(source, /focus-baseline-simulated/);
});
