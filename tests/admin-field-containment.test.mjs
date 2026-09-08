import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (filename) => readFileSync(resolve(root, filename), "utf8");

test("cartões de acesso Advisor mantêm o foco dentro da própria borda", () => {
  const dashboard = source("components/app/ai-insights-dashboard.tsx");
  const option = dashboard.slice(dashboard.indexOf("const descriptionId = `${id}-description`"));
  assert.match(option, /focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring focus-within:ring-offset-0/);
  assert.doesNotMatch(option, /focus-within:ring-offset-[1-9]/);
  assert.match(option, /max-w-full/);
  assert.match(option, /focus-within-contained/);
  assert.match(option, /\[overflow-wrap:anywhere\]/);
});

test("título do widget pode encolher sem impor largura fixa ao inspetor", () => {
  const layout = source("components/app/card-layout.tsx");
  const editor = layout.slice(layout.indexOf("function WidgetTitleEditor("), layout.indexOf("function WidgetZoomPicker("));
  assert.match(editor, /flex min-w-0 max-w-full w-full flex-1/);
  assert.doesNotMatch(editor, /min-w-\[[^\]]+\]/);
  assert.match(editor, /h-8 w-8 shrink-0/);
  assert.match(editor, /maxLength=\{120\}/);
  assert.match(layout, /min-w-0 max-w-full rounded-lg border bg-card p-3/);
});

test("botões nativos do editor têm foco interno e contraste nos estados selecionados", () => {
  const layout = source("components/app/card-layout.tsx");
  assert.doesNotMatch(layout, /focus-visible:ring-offset-[1-9]/);
  for (const functionName of ["DimensionLevelButton", "WidgetChartTypePicker"]) {
    const start = layout.indexOf(`function ${functionName}(`);
    const next = layout.indexOf("\nfunction ", start + 1);
    const implementation = layout.slice(start, next < 0 ? undefined : next);
    assert.match(implementation, /focus-visible:ring-2 focus-visible:ring-inset/);
    assert.match(implementation, /focus-contained/);
    assert.match(implementation, /focus-visible:ring-primary-foreground/);
  }
  assert.match(layout, /top-1 z-30 flex h-6 w-8 -translate-x-1\/2 cursor-grab/);
  assert.doesNotMatch(layout, /-translate-y-1\/2 cursor-grab/);
});

test("a cor personalizada conserva indicação de foco visível e dimensão limitada", () => {
  const layout = source("components/app/card-layout.tsx");
  const picker = layout.slice(layout.indexOf("function WidgetColorPicker("), layout.indexOf("function widgetColorPreviewStyle("));
  assert.match(picker, /focus-within:ring-2 focus-within:ring-inset/);
  assert.match(picker, /focus-within-contained/);
  assert.match(picker, /pointer-events-none absolute inset-\[2px\]/);
  assert.match(picker, /absolute inset-0 h-full min-w-0 w-full cursor-pointer opacity-0/);
  assert.match(picker, /aria-label="Escolher cor personalizada"/);
});

test("status de cenário Ocupação usa foco interno sem ampliar o controle", () => {
  const manager = source("components/app/occupancy-scenario-manager.tsx");
  assert.match(manager, /min-w-0 w-full max-w-\[180px\]/);
  assert.match(manager, /focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0/);
  assert.doesNotMatch(manager, /focus-visible:ring-offset-[1-9]/);
  assert.match(manager, /role="switch"/);
  assert.match(manager, /focus-contained/);
  assert.match(manager, /aria-checked=\{draft.active\}/);
});

test("editor hexagonal mantém focos internos e nomes completos na biblioteca", () => {
  const editor = source("components/app/occupancy-hex-layout-editor.tsx");
  assert.doesNotMatch(editor, /focus-visible:ring-offset-[1-9]/);
  assert.equal(editor.match(/focus-contained/g)?.length, 3);
  assert.equal(editor.match(/focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0/g)?.length, 3);
  const palette = editor.slice(editor.indexOf("function ScenarioPalette("), editor.indexOf("function CellInspector("));
  assert.match(palette, /relative min-w-0 max-w-full/);
  assert.match(palette, /min-w-0 max-w-full max-h-\[48dvh\]/);
  assert.match(palette, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(palette, /truncate|line-clamp-/);
});
