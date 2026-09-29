import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(import.meta.dirname, "..", "components/app/infrastructure-manager.tsx"),
  "utf8",
);

test("Locais consultam setores só do local selecionado e não fazem polling administrativo", () => {
  const subLocations = source.slice(
    source.indexOf("const loadSubLocations ="),
    source.indexOf("const loadLineCounts ="),
  );
  assert.match(subLocations, /if \(!locationsTabActive\)/);
  assert.match(subLocations, /if \(!companyScopeId \|\| !selectedLocationId\)/);
  assert.match(subLocations, /\/locations\/\$\{selectedLocationId\}\/sub-locations/);
  assert.match(subLocations, /selectedLocationIdRef\.current !== requestedLocationId/);
  assert.doesNotMatch(source, /useResourceAutoRefresh\(/);
  assert.match(source, /locationDialog \|\| Object\.keys\(workerLocationAssignments\)\.length > 0/);
});

test("cadastro de local independe do catálogo opcional de Workers", () => {
  const saveLocation = source.slice(
    source.indexOf("async function saveLocation()"),
    source.indexOf("async function saveSubLocation()"),
  );
  assert.ok(saveLocation.length > 0);
  assert.doesNotMatch(saveLocation, /if \(!workers\.length\)|if \(!locationForm\.worker_id\)/);
  assert.match(saveLocation, /locationForm\.worker_id === "none" \? "" : locationForm\.worker_id/);
  assert.match(source, /<SelectItem value="none">Sem Worker<\/SelectItem>/);
  assert.match(source, /Worker responsável \(opcional\)/);
});

test("catálogos de Locais e Câmeras são invalidados também ao trocar usuário", () => {
  assert.match(source, /baseCatalogIdentity === infrastructureCacheScope/);
  assert.match(source, /infrastructureCacheScopeRef\.current = infrastructureCacheScope/);
  assert.match(source, /setBaseCatalogIdentity\(""\)/);
  assert.match(source, /setBaseCatalogIdentity\(infrastructureCacheScope\)/);
  assert.match(source, /infrastructureCacheScopeRef\.current !== requestedResourceScope/);
  assert.match(source, /}, \[infrastructureCacheScope\]\);/);
});
