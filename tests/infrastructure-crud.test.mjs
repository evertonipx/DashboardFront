import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(projectRoot, "components/app/infrastructure-manager.tsx"),
  "utf8",
);

test("infraestrutura oferece seleção acessível nos quatro CRUDs", () => {
  assert.match(source, /import \{ Checkbox \} from "@\/components\/ui\/checkbox"/);
  for (const state of [
    "checkedLocationIds",
    "checkedSubLocationIds",
    "checkedCameraIds",
    "checkedLineIds",
  ]) {
    assert.match(source, new RegExp(`const \\[${state},`));
  }
  for (const label of [
    "Selecionar todos os locais",
    "Selecionar todos os setores",
    "Selecionar todas as câmeras",
    "Selecionar todas as linhas de contagem",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /checked: boolean \| "indeterminate"/);
});

test("seleção geral respeita somente os registros visíveis pelo filtro local", () => {
  for (const visibleRows of [
    "visibleLocations",
    "visibleSubLocations",
    "visibleCameras",
    "visibleLineCounts",
  ]) {
    assert.match(
      source,
      new RegExp(
        `selectedVisibleCount\\(\\s*${visibleRows},[\\s\\S]*?updateVisibleSelection\\([\\s\\S]*?${visibleRows}\\.map`,
      ),
    );
  }
  assert.match(source, /filter\.status === "active"/);
  assert.match(source, /filter\.status === "inactive"/);
  assert.match(source, /normalize\("NFD"\)/);
  assert.match(source, /filtered \? `\$\{visibleCount\} de \$\{totalCount\}`/);
});

test("ações em lote usam somente PUT e DELETE já suportados por recurso", () => {
  for (const kind of ["locations", "subLocations", "cameras", "lines"]) {
    assert.match(
      source,
      new RegExp(`updateBulkStatus\\("${kind}", true\\)`),
    );
    assert.match(
      source,
      new RegExp(`updateBulkStatus\\("${kind}", false\\)`),
    );
    assert.match(source, new RegExp(`requestBulkDelete\\("${kind}"\\)`));
  }
  assert.match(
    source,
    /for \(const item of pendingItems\) \{[\s\S]*?method: "PUT"/,
  );
  assert.match(
    source,
    /for \(const item of request\.items\) \{[\s\S]*?method: "DELETE"/,
  );
  assert.doesNotMatch(source, /\/bulk(?:\/|"|`)/);
});

test("alteração de status preserva os campos obrigatórios sem mover vínculos", () => {
  assert.match(
    source,
    /kind === "locations"[\s\S]*?return \{[\s\S]*?active,[\s\S]*?description: item\.description[\s\S]*?name: item\.name/,
  );
  assert.match(
    source,
    /kind === "cameras"[\s\S]*?return \{[\s\S]*?active,[\s\S]*?code: item\.code[\s\S]*?description: item\.description[\s\S]*?name: item\.name/,
  );
  assert.match(source, /return \{ active, name: item\.name \}/);
  assert.match(
    source,
    /active,[\s\S]*?line_code: item\.line_code,[\s\S]*?name: item\.name/,
  );

  const statusBody = source.slice(
    source.indexOf("function bulkStatusUpdateBody"),
    source.indexOf("function resourceNeedsStatusUpdate"),
  );
  assert.doesNotMatch(statusBody, /location_id|sub_location_id|worker_id/);
});

test("falhas parciais permanecem selecionadas e há uma única recarga por lote", () => {
  assert.match(source, /failedIds\.push\(item\.id\)/);
  assert.match(source, /setFailedBulkSelection\(kind, failedIds/);
  assert.match(source, /setFailedBulkSelection\(request\.kind, failedIds/);
  assert.match(source, /continuam selecionados/);
  assert.match(source, /processados um por vez/);
});

test("catálogos só habilitam CRUD depois de certificados para empresa e pai atuais", () => {
  assert.match(
    source,
    /const baseCatalogCertified =\s*Boolean\(companyScopeId\) && baseCatalogCompanyId === companyScopeId/,
  );
  assert.match(
    source,
    /const subLocationCatalogCertified =[\s\S]*?subLocationCatalogScope\.companyId === companyScopeId &&[\s\S]*?subLocationCatalogScope\.parentId === selectedLocationId/,
  );
  assert.match(
    source,
    /const lineCatalogCertified =[\s\S]*?lineCatalogScope\.companyId === companyScopeId &&[\s\S]*?lineCatalogScope\.parentId === selectedCameraId/,
  );
  assert.match(
    source,
    /const baseActionsDisabled = bulkMutationRunning \|\| !baseCatalogCertified/,
  );
  assert.match(
    source,
    /const subLocationActionsDisabled =[\s\S]*?!subLocationCatalogCertified/,
  );
  assert.match(
    source,
    /const lineActionsDisabled = bulkMutationRunning \|\| !lineCatalogCertified/,
  );
  assert.match(source, /function requireCertifiedCatalog/);

  const companyReset = source.slice(
    source.indexOf("React.useEffect(() => {\n    setLocations([])"),
    source.indexOf("const loadBase = React.useCallback"),
  );
  assert.match(companyReset, /setBaseCatalogCompanyId\(""\)/);
  assert.match(
    companyReset,
    /setSubLocationCatalogScope\(\{ companyId: "", parentId: "" \}\)/,
  );
  assert.match(
    companyReset,
    /setLineCatalogScope\(\{ companyId: "", parentId: "" \}\)/,
  );
});

test("respostas filhas obsoletas não são publicadas após trocar empresa ou pai", () => {
  const subLocationLoader = source.slice(
    source.indexOf("const loadSubLocations = React.useCallback"),
    source.indexOf("const loadLineCounts = React.useCallback"),
  );
  assert.match(
    subLocationLoader,
    /companyScopeIdRef\.current !== requestedCompanyScopeId \|\|\s*selectedLocationIdRef\.current !== requestedLocationId/,
  );
  assert.match(
    subLocationLoader,
    /setSubLocationCatalogScope\(\{\s*companyId: requestedCompanyScopeId,\s*parentId: requestedLocationId/,
  );

  const lineLoader = source.slice(
    source.indexOf("const loadLineCounts = React.useCallback"),
    source.indexOf("React.useEffect(() => {\n    void loadBase"),
  );
  assert.match(
    lineLoader,
    /companyScopeIdRef\.current !== requestedCompanyScopeId \|\|\s*selectedCameraIdRef\.current !== requestedCameraId/,
  );
  assert.match(
    lineLoader,
    /setLineCatalogScope\(\{\s*companyId: requestedCompanyScopeId,\s*parentId: requestedCameraId/,
  );

  assert.match(source, /type BulkDeleteRequest = \{\s*companyId: string/);
  assert.match(
    source,
    /function bulkRequestIsCurrent\(request: BulkDeleteRequest\)[\s\S]*?companyScopeIdRef\.current !== request\.companyId/,
  );
  assert.match(source, /companyScopeId: request\.companyId/);
});

test("trocar filtros preserva selecionados ocultos e trocar o pai limpa apenas os filhos", () => {
  for (const filterSetter of [
    "setLocationFilter",
    "setSubLocationFilter",
    "setCameraFilter",
    "setLineFilter",
  ]) {
    assert.match(source, new RegExp(`onChange=\\{${filterSetter}\\}`));
  }

  const selectLocation = source.slice(
    source.indexOf("function selectLocation"),
    source.indexOf("function selectCamera"),
  );
  assert.match(selectLocation, /selectedLocationIdRef\.current = locationId/);
  assert.match(selectLocation, /setSubLocations\(\[\]\)/);
  assert.match(
    selectLocation,
    /setSubLocationCatalogScope\(\{ companyId: "", parentId: "" \}\)/,
  );
  assert.match(selectLocation, /setCheckedSubLocationIds\(\[\]\)/);
  assert.doesNotMatch(selectLocation, /setCheckedLocationIds\(\[\]\)/);

  const selectCamera = source.slice(
    source.indexOf("function selectCamera"),
    source.indexOf("function handleTabChange"),
  );
  assert.match(selectCamera, /selectedCameraIdRef\.current = cameraId/);
  assert.match(selectCamera, /setLineCounts\(\[\]\)/);
  assert.match(
    selectCamera,
    /setLineCatalogScope\(\{ companyId: "", parentId: "" \}\)/,
  );
  assert.match(selectCamera, /setCheckedLineIds\(\[\]\)/);
  assert.doesNotMatch(selectCamera, /setCheckedCameraIds\(\[\]\)/);
});
