import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { run } from "node:test";
import { tap } from "node:test/reporters";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(resolve(root, "tests"))
  .filter((file) => file.endsWith(".test.mts"))
  .sort()
  .map((file) => resolve(root, "tests", file));

if (!files.length) throw new Error("Nenhum teste TypeScript foi encontrado.");

// Explicit discovery also works on Windows and Node 20 (no shell glob needed).
// Bound parallelism: many fixtures compile TS or render ECharts in memory.
// The programmatic concurrency option is also available on Node 20.9, unlike
// the CLI --test-concurrency flag, which was introduced in later releases.
process.chdir(root);
const results = run({ files, concurrency: 2 });
results.on("test:fail", () => { process.exitCode = 1; });
await pipeline(results, tap, process.stdout);
