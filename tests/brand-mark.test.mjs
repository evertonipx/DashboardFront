import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const postcss = require("postcss");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function load(path) {
  const source = readFileSync(resolve(root, path), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("module", "exports", "require", javascript)(loaded, loaded.exports,
    (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
  return loaded.exports;
}

const { IPXBrandMark } = load("components/app/brand-mark.tsx");
const render = (props = {}) => renderToStaticMarkup(React.createElement(IPXBrandMark, props));
const markup = render();
const css = postcss.parse(markup.match(/<style>([\s\S]*?)<\/style>/)[1]);

test("logo IPX é vetorial, estável e identificado quando o menu está recolhido", () => {
  assert.match(markup, /<svg[^>]*viewBox="0 0 48 48"/);
  assert.match(markup, /width="40" height="40"/);
  assert.match(markup, /role="img" aria-label="IPXData"/);
  assert.match(markup, /focusable="false"/);
  assert.match(markup, /class="[^"]*shrink-0/);
  assert.ok((markup.match(/<path\b/g) || []).length >= 4);
  assert.doesNotMatch(markup, /<image\b|<foreignObject\b|<script\b|\bhref=|<text\b/);
});

test("cópias decorativas não repetem o nome acessível e preservam os tamanhos mobile", () => {
  const compact = render({ className: "h-9 w-9", decorative: true });
  assert.match(compact, /aria-hidden="true"/);
  assert.match(compact, /h-9 w-9/);
  assert.doesNotMatch(compact, /role="img"|aria-label=/);
  assert.equal(render(), markup, "IDs estáveis no SSR, sem valores aleatórios ou relógio");
});

test("cada logo mantém seu gradiente e recorte locais, sem colisão entre desktop e mobile", () => {
  const page = renderToStaticMarkup(React.createElement("div", null,
    React.createElement(IPXBrandMark), React.createElement(IPXBrandMark, { decorative: true })));
  const marks = page.match(/<svg\b[\s\S]*?<\/svg>/g);
  assert.equal(marks.length, 2);
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, ids.length);
  for (const svg of marks) {
    const localIds = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const references = [...svg.matchAll(/url\(#([^)]*)\)/g)].map((match) => match[1]);
    assert.equal(references.length, 2);
    assert.ok(references.every((id) => localIds.includes(id)));
    assert.match(svg, /clipPathUnits="userSpaceOnUse"/);
    assert.match(svg, /clip-rule="evenodd"/);
    assert.match(svg, /class="ipx-mark-scan"[^>]*aria-hidden="true"/);
  }
});

test("letras têm preenchimento sólido e não usam traços finos ou ornamentos", () => {
  const letters = css.nodes.find((rule) => rule.type === "rule" && rule.selector === "[data-ipx-brand-mark] .ipx-mark-type");
  assert.ok(letters);
  assert.match(letters.toString(), /fill: currentColor/);
  assert.match(letters.toString(), /stroke: none/);
  assert.doesNotMatch(letters.toString(), /opacity:|stroke-width:/);
  assert.doesNotMatch(markup, /ipx-mark-detail|ipx-mark-accent|ipx-mark-trace|ipx-mark-hover/);
  assert.match(markup, /fill-rule="evenodd"/);
});

test("CSS é restrito ao logo e usa movimento finito sem piscar, girar ou mudar o layout", () => {
  css.walkRules((rule) => {
    if (rule.parent.type === "atrule" && rule.parent.name === "keyframes") return;
    for (const selector of rule.selectors) assert.ok(selector.startsWith("[data-ipx-brand-mark]"), selector);
  });
  const animationRules = [];
  css.walkDecls("animation", (declaration) => animationRules.push(declaration.value));
  assert.ok(animationRules.some((value) => /ipx-brand-scan 3\.6s/.test(value)));
  assert.doesNotMatch(css.toString(), /infinite|filter:|box-shadow:|@import|url\(/);
  const transformRules = [];
  css.walkDecls("transform", (declaration) => {
    transformRules.push(declaration);
    const keyframe = declaration.parent.parent;
    assert.ok(declaration.parent.selector.endsWith(".ipx-mark-sweep") ||
      (keyframe.type === "atrule" && keyframe.name === "keyframes" && keyframe.params === "ipx-brand-scan"));
  });
  assert.ok(transformRules.length > 0);
});

test("preferência de movimento reduzido desativa a animação e alto contraste mantém o monograma", () => {
  const media = css.nodes.filter((node) => node.type === "atrule" && node.name === "media");
  const reduced = media.find((node) => node.params === "(prefers-reduced-motion: reduce)");
  const forced = media.find((node) => node.params === "(forced-colors: active)");
  assert.ok(reduced);
  assert.match(reduced.toString(), /animation: none/);
  assert.match(reduced.toString(), /display: none/);
  assert.ok(forced);
  assert.match(forced.toString(), /fill: CanvasText/);
});

test("somente os emblemas da navegação usam o novo SVG", () => {
  const shell = readFileSync(resolve(root, "components/app/app-shell.tsx"), "utf8");
  const mobile = readFileSync(resolve(root, "components/app/mobile-navigation.tsx"), "utf8");
  assert.match(shell, /<IPXBrandMark className="h-10 w-10" decorative=\{!sidebarCollapsed\}/);
  assert.equal((mobile.match(/<IPXBrandMark\b/g) || []).length, 2);
  assert.match(mobile, /<IPXBrandMark className="h-9 w-9" decorative/);
  const login = readFileSync(resolve(root, "app/login/page.tsx"), "utf8");
  assert.doesNotMatch(login, /IPXBrandMark/);
});
