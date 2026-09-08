import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");
const root = new URL("../", import.meta.url);
const source = (file) => readFileSync(new URL(file, root), "utf8");

test("selected labels and dropdown options wrap without ellipsis or line clamps", () => {
  const select = source("components/ui/select.tsx");
  assert.match(select, /data-select-trigger/);
  assert.match(select, /h-auto min-h-10/);
  assert.match(select, /whitespace-normal/);
  assert.match(select, /overflow-wrap:anywhere/);
  assert.doesNotMatch(select, /truncate|line-clamp|text-ellipsis/);
  // Radix discards ItemText's own className/style, so style its asChild span.
  assert.match(select, /ItemText asChild>\s*<span className="[^\"]*whitespace-normal[^\"]*overflow-wrap:anywhere/);
  assert.match(select, /SelectScrollUpButton/);
  assert.match(select, /SelectScrollDownButton/);
});

test("compact select heights remain minimums and popups fit available viewport", () => {
  const css = source("app/globals.css");
  assert.match(css, /\[data-select-trigger\] \{\s*height: auto;/);
  assert.match(css, /\[data-select-trigger\]\.h-8 \{\s*min-height: 2rem;/);
  assert.match(css, /\[data-select-trigger\]\.h-9 \{\s*min-height: 2\.25rem;/);
  assert.match(css, /max-height: min\(24rem, var\(--radix-select-content-available-height/);
  assert.match(css, /max-width: min\(calc\(100vw - 1rem\), var\(--radix-select-content-available-width/);
});

test("widget scenario picker preserves complete names in its summary and selection list", () => {
  const picker = source("components/app/scenario-picker.tsx");
  assert.doesNotMatch(picker, /truncate|line-clamp|max-w-28|max-w-36/);
  assert.match(picker, /data-scenario-name/);
  assert.match(picker, /flex min-w-0 flex-wrap items-center gap-1/);
  assert.match(picker, /data-scenario-name className="[^\"]*overflow-wrap:anywhere/);
  assert.match(picker, /selectedScenarios\.slice\(0, 2\)/);
});

test("live scenario and location fields get readable width before individual actions reflow", () => {
  for (const file of ["realtime-dashboard.tsx", "occupancy-scenario-dashboard.tsx"]) {
    const component = source(`components/app/${file}`);
    const start = component.indexOf('aria-label="Controles da visão');
    const end = component.indexOf("{operationalSettingsOpen ? (", start);
    assert.ok(start >= 0 && end > start);
    const toolbar = component.slice(start, end);
    assert.match(toolbar, /data-dashboard-toolbar/);
    assert.match(toolbar, /data-toolbar-filters/);
    assert.match(toolbar, /data-toolbar-actions/);
    assert.match(toolbar, /flex-\[1_1_14rem\]/);
    assert.match(toolbar, /h-auto min-h-8 w-full/);
    assert.doesNotMatch(toolbar, /grid-cols-|row-start-|col-start-|overflow-x-auto|line-clamp|truncate/);
  }
});

test("Tailwind generates the container-query utilities used throughout the frontend", async () => {
  const config = loadConfig(fileURLToPath(new URL("tailwind.config.ts", root)));
  const result = await postcss([tailwind({
    ...config,
    content: [{ raw: '<div class="@container"><div class="@sm:grid-cols-2 @2xl:grid-cols-3 min-w-0"></div></div>' }],
  })]).process("@tailwind utilities;", { from: undefined });
  assert.match(result.css, /container-type: inline-size/);
  assert.match(result.css, /@container \(min-width: 24rem\)/);
  assert.match(result.css, /@container \(min-width: 42rem\)/);
  assert.match(result.css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(result.css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
