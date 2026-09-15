import ts from "typescript";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const postcss: typeof import("postcss").default = require("postcss");
const tailwind: typeof import("tailwindcss") = require("tailwindcss");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "counting-report-period-control",
  "occupancy-date-range-picker",
  "scenario-picker",
  "occupancy-scenario-dashboard",
  "occupancy-reports-dashboard",
  "scenario-reports-dashboard",
  "occupancy-comparison-widgets",
  "widget-bento-preview",
  "widget-view-presets",
  "period-analysis-dashboard",
];
const sources = new Map(files.map((name) => [name, source(name)]));
function requiredSource(name: string): string {
  const value = sources.get(name);
  assert.ok(value, `Fonte ausente: ${name}`);
  return value;
}

test("controles locais mantêm foco dentro das bordas e hook de alto contraste", () => {
  let checked = 0;
  for (const [name, text] of sources) {
    const parsed = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) && node.text.split(/\s+/).includes("focus-visible:ring-2")) {
        const classes = node.text.split(/\s+/);
        for (const expected of ["focus-contained", "focus-visible:ring-inset", "focus-visible:ring-offset-0"]) {
          assert.ok(classes.includes(expected), `${name}: missing ${expected}`);
        }
        checked += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    assert.doesNotMatch(text, /focus-visible:ring-offset-[12]\b/, name);
  }
  assert.equal(checked, 11);
});

test("foco sobre seleção primária usa a cor de texto contrastante", () => {
  for (const name of ["occupancy-date-range-picker", "occupancy-scenario-dashboard", "occupancy-reports-dashboard"]) {
    assert.match(requiredSource(name), /bg-primary text-primary-foreground shadow-sm focus-visible:ring-primary-foreground/);
  }
  assert.match(requiredSource("occupancy-date-range-picker"), /bg-primary font-semibold text-primary-foreground hover:bg-primary\/90 focus-visible:ring-primary-foreground/);
});

test("toggles comparativos podem encolher e quebrar texto sem achatar o indicador", () => {
  for (const name of ["occupancy-reports-dashboard", "scenario-reports-dashboard"]) {
    const text = requiredSource(name).split("function PreviousPeriodToggle(")[1].split("function ComparisonModeSelect(")[0];
    assert.match(text, /min-w-0 max-w-full/);
    assert.match(text, /whitespace-normal/);
    assert.match(text, /h-4 w-7 shrink-0/);
    assert.doesNotMatch(text, /whitespace-nowrap|inline-flex shrink-0/);
  }
});

test("meses empilham número e rótulo em largura pequena mantendo navegação existente", () => {
  const text = requiredSource("occupancy-date-range-picker");
  assert.match(text, /min-h-14 min-w-0 flex-col[^"\n]*sm:flex-row/);
  assert.match(text, /min-w-0 break-words text-sm font-semibold/);
  assert.match(text, /onKeyDown=\{\(event\) =>\s*onDayKeyDown\(event, dateInput\)/);
});

test("campos de widgets e filtros não impõem largura mínima aos pais", () => {
  assert.match(requiredSource("period-analysis-dashboard"), /function Field\([\s\S]*?<div className="min-w-0 space-y-2">/);
  assert.match(requiredSource("period-analysis-dashboard"), /grid w-full min-w-0 max-w-full grid-cols-2 gap-2 sm:w-\[260px\]/);
  assert.doesNotMatch(requiredSource("occupancy-scenario-dashboard"), /min-w-\[180px\]/);
  assert.match(requiredSource("occupancy-comparison-widgets"), /flex min-w-0 max-w-full cursor-pointer items-center gap-3/);
});

test("replicação usa checkbox compartilhado, sem mudar callbacks nem ocultar mais texto", () => {
  const text = requiredSource("widget-view-presets");
  assert.match(text, /<Checkbox\s+checked=\{checked\}\s+onCheckedChange=\{\(\) => toggleScope\(scope.id\)\}/);
  assert.doesNotMatch(text, /<input\b/);
  assert.match(text, /grid max-h-52 min-w-0/);
  assert.match(text, /flex min-w-0 max-w-full cursor-pointer items-center gap-2/);
  assert.match(text, /<span className="min-w-0 flex-1 truncate">/);
});

test("botões compactos mantêm altura explícita com o novo mínimo do componente compartilhado", () => {
  assert.match(requiredSource("occupancy-scenario-dashboard"), /h-9 min-h-9 w-full shrink-0/);
  assert.equal(requiredSource("occupancy-comparison-widgets").match(/h-6 min-h-6 px-2 py-0 text-\[10px\]/g)?.length, 2);
});

test("Tailwind instalado compila foco inset, offset zero e contraste selecionado", async () => {
  const result = await postcss([tailwind({
    content: [{ raw: [...sources.values()].join("\n"), extension: "tsx" }],
    corePlugins: { preflight: false },
    theme: { extend: { colors: { ring: "#1763af", "primary-foreground": "#ffffff" } } },
  })]).process("@tailwind utilities;", { from: undefined });
  const declarations = (selector: string) => {
    const values = new Map<string, string>();
    result.root.walkRules((rule) => {
      if (rule.selector === selector) rule.walkDecls((declaration) => { values.set(declaration.prop, declaration.value); });
    });
    return values;
  };
  assert.equal(declarations(".focus-visible\\:ring-inset:focus-visible").get("--tw-ring-inset"), "inset");
  assert.equal(declarations(".focus-visible\\:ring-offset-0:focus-visible").get("--tw-ring-offset-width"), "0px");
  assert.ok(declarations(".focus-visible\\:ring-primary-foreground:focus-visible").has("--tw-ring-color"));
  assert.equal(declarations(".min-w-0").get("min-width"), "0px");
});

function source(name: string) {
  return readFileSync(resolve(root, `components/app/${name}.tsx`), "utf8");
}
