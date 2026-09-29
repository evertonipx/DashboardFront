import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

test("catálogos de câmeras e locais carregam sob demanda, sem polling administrativo", () => {
  const infrastructure = source("components/app/infrastructure-manager.tsx");

  assert.doesNotMatch(infrastructure, /useResourceAutoRefresh|setInterval/);
  assert.match(infrastructure, /void loadBase\(\{ preferCache: true \}\)/);
  assert.match(infrastructure, /void loadWorkers\(\{ preferCache: true \}\)/);
  assert.match(infrastructure, /void loadLineCounts\(\{ preferCache: true \}\)/);
  assert.match(infrastructure, /function refreshVisibleInfrastructure\(\)/);
  assert.match(infrastructure, /onClick=\{refreshVisibleInfrastructure\}/);
  assert.match(infrastructure, /bypassReadCache: !preferCache && !silent/);
  assert.match(infrastructure, /await loadLineCounts\(\)/);
  assert.match(infrastructure, /await loadBase\(\)/);
});

test("mutar câmera recarrega apenas câmeras e mantém os locais certificados", () => {
  const infrastructure = source("components/app/infrastructure-manager.tsx");
  const baseLoader = infrastructure.slice(
    infrastructure.indexOf("const loadBase = React.useCallback"),
    infrastructure.indexOf("const loadWorkers = React.useCallback"),
  );

  assert.match(baseLoader, /const camerasOnly = resources === "cameras"/);
  assert.match(baseLoader, /camerasOnly\s*\? Promise\.resolve\(null\)\s*: fetchCachedInfrastructureResource/);
  assert.match(baseLoader, /if \(!camerasOnly && locationRows\) \{/);
  assert.match(infrastructure, /setCameraDialog\(false\);\s*await loadBase\(\{ resources: "cameras" \}\)/);
  assert.match(infrastructure, /"Câmera excluída",\s*\(\) => loadBase\(\{ resources: "cameras" \}\)/);
  assert.match(infrastructure, /kind === "cameras"\) await loadBase\(\{ resources: "cameras" \}\)/);
  assert.match(infrastructure, /request\.kind === "cameras"\) \{\s*await loadBase\(\{ resources: "cameras" \}\)/);
});

test("Workers mantém somente a atualização de presença e isola respostas por usuário e empresa", () => {
  const workers = source("components/app/worker-manager.tsx");

  assert.match(workers, /const workerAccessScopeKey = JSON\.stringify\(\[\s*user\?\.id \?\? "",\s*effectiveCompanyId \?\? ""/);
  assert.match(workers, /workerCatalogAccessScopeKey === workerAccessScopeKey/);
  assert.match(workers, /workerAccessScopeKeyRef\.current !== requestedAccessScopeKey/);
  assert.match(workers, /\}, \[workerAccessScopeKey\]\);/);
  assert.match(workers, /enabled:\s*canViewWorkers &&[\s\S]*?!workerDialog &&[\s\S]*?!keyNotice/);
  assert.match(workers, /intervalMs: RESOURCE_METADATA_REFRESH_INTERVAL_MS/);
  assert.match(workers, /onClick=\{\(\) => void loadWorkers\(\{ bypassReadCache: true \}\)\}/);
});
