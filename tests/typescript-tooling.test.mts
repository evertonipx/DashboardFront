import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createModuleLoader } from "./helpers/module-loader.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("aplicação e ferramentas mantêm verificação estrita e independente", () => {
  const base = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const tooling = ts.readConfigFile(resolve(root, "tsconfig.tooling.json"), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(tooling.config, ts.sys, root);
  assert.equal(base.config.compilerOptions.strict, true);
  assert.equal(base.config.compilerOptions.allowJs, false);
  assert.equal(config.options.strict, true);
  assert.equal(config.options.noEmit, true);
  assert.equal(config.options.noCheck, undefined);
  assert.equal(config.options.module, ts.ModuleKind.NodeNext);
  assert.ok(config.fileNames.some((file) => file.endsWith("tools/run-tests.mts")));
  assert.ok(config.fileNames.some((file) => file.endsWith("tests/analytics-time.test.mts")));
  assert.ok(base.config.exclude.includes("tests"));
  assert.ok(base.config.exclude.includes("tools"));
});

test("scripts executam TypeScript com runner compatível e sem caminhos JavaScript antigos", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
  for (const [name, command] of Object.entries(manifest.scripts)) {
    assert.doesNotMatch(command, /(?:tests|tools)\/[^\s]+\.mjs/, name);
    if (/\b(?:tests|tools)\/[^\s]+\.mts/.test(command)) {
      assert.match(command, /node --import tsx/, name);
    }
  }
  for (const directory of ["tests", "tools"]) {
    assert.deepEqual(readdirSync(resolve(root, directory)).filter((file) => /\.(?:mjs|cjs|js)$/.test(file)), []);
  }
});

test("loader compartilha dependências dentro da suíte, mas isola os caches entre suítes", () => {
  const first = createModuleLoader(root);
  const second = createModuleLoader(root);
  const loaded = first<typeof import("../lib/card-layout-packing.ts")>("lib/card-layout-packing.ts");
  assert.equal(first("lib/card-layout-packing.ts"), loaded);
  assert.notEqual(second("lib/card-layout-packing.ts"), loaded);
  assert.deepEqual(loaded.packCardLayout([{ id: "a", columnSpan: 1, rowSpan: 1 }], 1), [
    { id: "a", columnSpan: 1, rowSpan: 1, columnStart: 1, rowStart: 1, sourceIndex: 0 },
  ]);
});

test("loader não mantém exportação parcial quando uma dependência falha", () => {
  let attempts = 0;
  const dependency = createModuleLoader(root)("lib/chart-label-value.ts");
  const mocks: Record<string, unknown> = {
    get "@/lib/chart-label-value"() {
      attempts += 1;
      if (attempts === 1) throw new Error("Dependência temporariamente indisponível");
      return dependency;
    },
  };
  const load = createModuleLoader(root, { mocks });
  assert.throws(() => load("lib/chart-zero-labels.ts"), /temporariamente indisponível/);
  const recovered = load<typeof import("../lib/chart-zero-labels.ts")>("lib/chart-zero-labels.ts");
  assert.equal(typeof recovered.suppressZeroChartLabels, "function");
  assert.equal(attempts, 2);
});
