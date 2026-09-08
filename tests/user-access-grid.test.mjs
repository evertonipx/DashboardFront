import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const gridSource = readFileSync("components/app/user-access-grid.tsx", "utf8");

function compileModule(path, overrides = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: compiledModule.exports,
    module: compiledModule,
    require: (name) => overrides[name] ?? require(name),
  }, { filename: path });
  return compiledModule.exports;
}

const utils = compileModule("lib/utils.ts");
const checkboxModule = compileModule("components/ui/checkbox.tsx", {
  "@/lib/utils": utils,
});
const sharedImports = {
  "@/components/ui/checkbox": checkboxModule,
  "@/lib/utils": utils,
};
const { UserAccessGrid } = compileModule("components/app/user-access-grid.tsx", sharedImports);
// Use the real JSX tree and Checkbox while supplying the sole outer hook for
// callback inspection without adding a browser/test-renderer dependency.
const { UserAccessGrid: inspectGrid } = compileModule("components/app/user-access-grid.tsx", {
  ...sharedImports,
  react: { ...React, useId: () => "test-access-grid" },
});

const baseOptions = [
  { id: "option-live", key: "api-private-live", label: "Ao Vivo", checked: false },
  { id: "option-analysis", key: "api-private-analysis", label: "Análises", checked: false },
  { id: "option-reports", key: "api-private-reports", label: "Relatórios", checked: false },
];

function group(options = baseOptions, extra = {}) {
  return { id: "group-private-counting", label: "Contagem", kind: "module", options, ...extra };
}

function createProps(groups = [group()], overrides = {}) {
  return { groups, onOptionChange() {}, onGroupChange() {}, ...overrides };
}

function findElements(tree, predicate) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return result;
}

function checkboxes(props) {
  return findElements(inspectGrid(props), (node) => node.type === checkboxModule.Checkbox);
}

function render(props) {
  return renderToStaticMarkup(React.createElement(UserAccessGrid, props));
}

test("grade mostra somente grupos/opções recebidos, sem expor identificadores de grants", () => {
  const description = "Permissão para acompanhar as entradas e saídas do empreendimento";
  const html = render(createProps([
    group(baseOptions.map((option, index) => ({ ...option, description: index ? undefined : description }))),
    group([{ id: "option-workers", key: "api-private-workers", label: "Workers", checked: true }], {
      id: "group-private-menus", label: "Menus gerais", kind: "menus",
    }),
  ]));
  for (const label of ["Contagem", "Ao Vivo", "Análises", "Relatórios", "Menus gerais", "Workers", description]) {
    assert.ok(html.includes(label), `rótulo completo: ${label}`);
  }
  assert.equal((html.match(/data-user-access-group=/g) ?? []).length, 2);
  assert.equal((html.match(/data-user-access-option=/g) ?? []).length, 4);
  assert.doesNotMatch(html, /api-private-|group-private-|option-live|Ocupação|Demográfico/);
});

test("seleção do grupo reflete nenhuma, parcial e todas as opções editáveis", () => {
  for (const [selectedCount, expected] of [[0, false], [1, "indeterminate"], [3, true]]) {
    const options = baseOptions.map((option, index) => ({ ...option, checked: index < selectedCount }));
    const [groupCheckbox] = checkboxes(createProps([group(options)]));
    assert.equal(groupCheckbox.props.checked, expected);
    assert.equal(groupCheckbox.props.disabled, false);
  }
  const partialHtml = render(createProps([group(baseOptions.map((option, index) => ({ ...option, checked: index === 0 })))]));
  assert.match(partialHtml, /aria-checked="mixed"/);
  assert.match(partialHtml, /aria-label="Selecionar todos os acessos de Contagem"/);
});

test("indisponíveis não impedem a seleção completa das opções editáveis", () => {
  const options = baseOptions.map((option, index) => ({ ...option, checked: index < 2, disabled: index === 2 }));
  const [groupCheckbox, ...optionCheckboxes] = checkboxes(createProps([group(options)]));
  assert.equal(groupCheckbox.props.checked, true);
  assert.equal(groupCheckbox.props.disabled, false);
  assert.equal(optionCheckboxes[2].props.disabled, true);
  assert.match(render(createProps([group(options)])), /Indisponível/);
});

test("grupo sem opções editáveis fica bloqueado e preserva a seleção existente", () => {
  for (const checked of [true, false]) {
    const options = baseOptions.map((option) => ({ ...option, checked, disabled: true }));
    const [groupCheckbox, ...optionCheckboxes] = checkboxes(createProps([group(options)]));
    assert.equal(groupCheckbox.props.checked, checked);
    assert.equal(groupCheckbox.props.disabled, true);
    assert.ok(optionCheckboxes.every((node) => node.props.disabled && node.props.checked === checked));
  }
  const options = baseOptions.map((option, index) => ({ ...option, checked: index === 0, disabled: true }));
  assert.equal(checkboxes(createProps([group(options)]))[0].props.checked, "indeterminate");
});

test("acesso já incluído e bloqueado não é apresentado como indisponível", () => {
  const description = "Acesso incluído pela gestão deste módulo";
  const options = baseOptions.map((option) => ({ ...option, checked: true, disabled: true, description }));
  const html = render(createProps([group(options)]));
  assert.doesNotMatch(html, /Indisponível/);
  assert.ok(html.includes(description));
});

test("callbacks informam grupo e opção selecionados sem substituir id por key legado", () => {
  const optionEvents = [];
  const groupEvents = [];
  const props = createProps([group(baseOptions.map((option) => ({ ...option, key: "shared-legacy-key" })))], {
    onOptionChange: (...args) => optionEvents.push(args),
    onGroupChange: (...args) => groupEvents.push(args),
  });
  const [groupCheckbox, ...optionCheckboxes] = checkboxes(props);
  groupCheckbox.props.onCheckedChange(true);
  groupCheckbox.props.onCheckedChange(false);
  optionCheckboxes[1].props.onCheckedChange(true);
  optionCheckboxes[1].props.onCheckedChange(false);
  assert.deepEqual(groupEvents, [["group-private-counting", true], ["group-private-counting", false]]);
  assert.deepEqual(optionEvents, [["group-private-counting", "option-analysis", true], ["group-private-counting", "option-analysis", false]]);
  assert.ok(baseOptions.every((option) => option.checked === false), "o componente não altera as props");
});

test("bloqueio global mantém checks e bloqueia callbacks sem declarar indisponibilidade", () => {
  const options = baseOptions.map((option, index) => ({ ...option, checked: index === 0 }));
  const props = createProps([group(options)], {
    disabled: true,
    onOptionChange: () => assert.fail("opção bloqueada não pode emitir alteração"),
    onGroupChange: () => assert.fail("grupo bloqueado não pode emitir alteração"),
  });
  const nodes = checkboxes(props);
  assert.equal(nodes[0].props.checked, "indeterminate");
  assert.equal(nodes[1].props.checked, true);
  for (const node of nodes) {
    assert.equal(node.props.disabled, true);
    node.props.onCheckedChange(true);
  }
  assert.doesNotMatch(render(props), /Indisponível/);
});

test("bloqueio individual também impede callbacks disparados programaticamente", () => {
  const props = createProps([group(baseOptions.map((option) => ({ ...option, disabled: true })))], {
    onOptionChange: () => assert.fail("opção indisponível não pode emitir alteração"),
    onGroupChange: () => assert.fail("grupo indisponível não pode emitir alteração"),
  });
  for (const node of checkboxes(props)) node.props.onCheckedChange(true);
});

test("acesso legado conjunto tem aviso único por grupo e não aparece em grupos independentes", () => {
  const linkedOptions = baseOptions.map((option) => ({ ...option, linked: true, key: "shared-legacy-key" }));
  const props = createProps([group(linkedOptions), group(baseOptions, { id: "group-occupancy", label: "Ocupação" })]);
  const html = render(props);
  assert.equal((html.match(/Acesso conjunto às três telas/g) ?? []).length, 1);
  const sections = findElements(inspectGrid(props), (node) => node.type === "section");
  assert.ok(sections[0].props["aria-describedby"]);
  assert.equal(sections[1].props["aria-describedby"], undefined);
});

test("grupos vazios não criam grants e suas seleções ficam desabilitadas", () => {
  assert.equal(checkboxes(createProps([])).length, 0);
  const nodes = checkboxes(createProps([group([])]));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].props.checked, false);
  assert.equal(nodes[0].props.disabled, true);
});

test("layout responde ao próprio container e mantém rótulos longos completos", () => {
  const label = "Relatórios detalhados de Contagem com segmentação por locais e cenários";
  const html = render(createProps([group([{ ...baseOptions[0], label }])]));
  assert.ok(html.includes(label));
  assert.match(html, /@container min-w-0/);
  assert.match(html, /@sm:grid-cols-2 @xl:grid-cols-3/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.doesNotMatch(gridSource, /\btruncate\b|whitespace-nowrap|overflow-hidden|fetch\(|localStorage|sessionStorage/);
});
