import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

function readSource(path) {
  return readFileSync(new URL(path, projectRoot), "utf8");
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const dashboards = [
  {
    path: "components/app/period-analysis-dashboard.tsx",
    start: 'aria-label="Controles da análise de Contagem"',
    end: "{loadingScenarios && !scopeOptions.length",
  },
  {
    path: "components/app/scenario-reports-dashboard.tsx",
    start: 'aria-label="Controles dos relatórios de Contagem"',
    end: "{reportSettingsOpen ? (",
  },
  {
    path: "components/app/occupancy-reports-dashboard.tsx",
    start: '? "Controles da análise de Ocupação"',
    end: "{(analysis && analysisSettingsOpen)",
  },
  {
    path: "components/app/demographics-dashboard.tsx",
    start: 'aria-label="Controles do módulo Demographics"',
    end: "<CardLayout",
  },
];

for (const dashboard of dashboards) {
  test(`${dashboard.path}: filters and individual actions can reflow without a fixed-width toolbar`, () => {
    const toolbar = section(
      readSource(dashboard.path),
      dashboard.start,
      dashboard.end,
    );
    assert.match(toolbar, /data-dashboard-toolbar/);
    assert.match(toolbar, /data-toolbar-filters/);
    assert.match(toolbar, /data-toolbar-actions/);
    assert.doesNotMatch(toolbar, /col-start-\d|row-start-\d/);
    assert.doesNotMatch(toolbar, /grid-cols-\[[^\]]*\d+px/);
    assert.doesNotMatch(toolbar, /overflow-x-auto|enterprise-horizontal-scroll/);
  });
}

for (const path of [
  "components/app/counting-report-period-control.tsx",
  "components/app/occupancy-date-range-picker.tsx",
]) {
  test(`${path}: the current period remains visible on narrow screens`, () => {
    const trigger = section(
      readSource(path),
      "<DialogTrigger asChild>",
      "</DialogTrigger>",
    );
    assert.match(trigger, /h-auto min-h-8 w-full/);
    assert.match(trigger, /whitespace-normal/);
    assert.match(trigger, /min-w-0 flex-1 break-words font-medium/);
    assert.doesNotMatch(trigger, /sr-only|truncate|line-clamp|w-8/);
    assert.match(trigger, /aria-label=/);
  });
}

test("report scope fields reserve readable widths and permit multiline values", () => {
  for (const path of [
    "components/app/scenario-reports-dashboard.tsx",
    "components/app/occupancy-reports-dashboard.tsx",
  ]) {
    const source = readSource(path);
    assert.match(source, /flex-\[1_1_140px\]/);
    assert.match(source, /flex-\[2_1_200px\]/);
    assert.match(source, /h-auto min-h-8 w-full min-w-0 bg-card/);
  }
});

test("period dialog options wrap their labels instead of truncating them", () => {
  const calendar = readSource("components/app/occupancy-date-range-picker.tsx");
  const report = readSource("components/app/counting-report-period-control.tsx");
  assert.match(calendar, /flex-col[^\"]*sm:flex-row/);
  assert.match(calendar, /block break-words text-xs font-semibold/);
  assert.match(report, /block break-words text-xs font-medium/);
  assert.doesNotMatch(calendar, /\btruncate\b/);
  assert.doesNotMatch(report, /\btruncate\b/);
});
