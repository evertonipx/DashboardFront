import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import ts from "typescript";

// Only the boundary of an injected, deliberately partial/adversarial fixture is
// dynamic. Helpers, compiler nodes and normal application code remain checked.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RuntimeFixture = any;

type CompiledModule = { exports: Record<string, RuntimeFixture> };

/** Each test suite owns its cache and mocks; nothing leaks between suites. */
export function createModuleLoader(
  projectRoot: string,
  options: {
    compilerOptions?: ts.CompilerOptions;
    mocks?: Record<string, unknown>;
  } = {},
) {
  const modules = new Map<string, CompiledModule>();

  function load<T = Record<string, RuntimeFixture>>(relativePath: string): T {
    const filename = resolve(projectRoot, relativePath);
    const cached = modules.get(filename);
    if (cached) return cached.exports as T;

    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        ...options.compilerOptions,
      },
      fileName: filename,
    }).outputText;
    const loadedModule: CompiledModule = { exports: {} };
    modules.set(filename, loadedModule);
    const nodeRequire = createRequire(filename);
    const localRequire = (specifier: string): unknown => {
      if (options.mocks && Object.hasOwn(options.mocks, specifier)) {
        return options.mocks[specifier];
      }
      if (specifier.startsWith("@/")) {
        const path = specifier.slice(2);
        return load(extname(path) ? path : `${path}.ts`);
      }
      return nodeRequire(specifier);
    };
    try {
      new Function("exports", "require", "module", "__filename", "__dirname", output)(
        loadedModule.exports, localRequire, loadedModule, filename, dirname(filename),
      );
      return loadedModule.exports as T;
    } catch (error) {
      // Never leave half-initialized exports cached after a failing fixture.
      modules.delete(filename);
      throw error;
    }
  }

  return load;
}
