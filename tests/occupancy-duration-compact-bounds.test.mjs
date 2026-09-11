import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript"), echarts = require("echarts"), modules = new Map();
const modelModule = load("lib/occupancy-duration-insights.ts");
const charts = load("components/app/occupancy-duration-insights-widgets.tsx");
const month = modelModule.buildOccupancyDurationInsightMonth(new Date("2026-09-02T03:00:00Z"), "America/Sao_Paulo");
const series = [{ scenarioId: "a", name: "Entrada", hours: Array.from({ length: 24 }, (_, hour) => ({
  dateKey: "2026-09-01", hour, confirmedOccupiedSeconds: 3600, confirmedFreeSeconds: 0, transitionSeconds: 0, unknownSeconds: 0, expectedSeconds: 3600,
})) }];
const model = modelModule.buildOccupancyDurationInsightModel(series, month);

for (const theme of ["light", "dark"]) test(`eixo percentual 0–100% cabe inteiro em gráficos compactos (${theme})`, () => {
  const option = charts.buildOccupancyDurationInsightOption({ kind: "occupancy_duration_daily_profile", model, month, scenarioNames: ["Entrada"], theme });
  for (const [width, height] of [[320, 190], [300, 128], [768, 230]]) {
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
    try {
      chart.setOption(option);
      const labels = [];
      chart.getViewOfComponentModel(chart.getModel().getComponent("yAxis")).group.traverse((element) => {
        if (element.type !== "text" || element.ignore || element.invisible || !element.style.text) return;
        const rect = element.getBoundingRect().clone(); rect.applyTransform(element.getComputedTransform());
        labels.push(element.style.text);
        assert.ok(rect.y >= -0.1, `${width}x${height} ${element.style.text} corta o topo: ${rect.y}`);
        assert.ok(rect.y + rect.height <= height + 0.1, `${width}x${height} corta a base`);
      });
      assert.ok(labels.includes("100%")); assert.ok(labels.includes("0%"));
      assert.doesNotMatch(chart.renderToSVGString(), /\bNaN\b|\bInfinity\b/);
    } finally { chart.dispose(); }
  }
});

function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} }; modules.set(path, loaded);
  const output = ts.transpileModule(readFileSync(resolve(path), "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("module", "exports", "require", output)(loaded, loaded.exports, (name) => {
    if (!name.startsWith("@/")) return require(name);
    if (name.startsWith("@/components/") && name !== "@/components/app/occupancy-chart-palette") return {};
    const base = name.slice(2); return load(existsSync(resolve(`${base}.ts`)) ? `${base}.ts` : `${base}.tsx`);
  });
  return loaded.exports;
}
