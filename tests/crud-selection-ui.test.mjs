import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Workers seleciona somente linhas visíveis e retém apenas IDs existentes", () => {
  const source = readSource("components/app/worker-manager.tsx");

  assert.match(source, /import \{ Checkbox \} from "@\/components\/ui\/checkbox"/);
  assert.match(source, /const visibleIds = new Set\(visibleWorkers\.map/);
  assert.match(source, /visibleIds\.forEach\(\(workerId\) =>/);
  assert.match(source, /retainExistingWorkerSelection\(nextWorkers/);
  assert.match(source, /selectedVisibleWorkerCount/);
  assert.match(source, /\? "indeterminate"/);
});

test("Workers certifica catálogo e item antes de qualquer mutação existente", () => {
  const source = readSource("components/app/worker-manager.tsx");
  const edit = between(source, "async function saveWorker", "async function removeWorker");
  const remove = between(
    source,
    "async function removeWorker",
    "function toggleWorkerSelection",
  );
  const rotate = between(
    source,
    "async function rotateWorkerKey",
    "function isCurrentWorkerMutation",
  );
  const bulk = between(
    source,
    "async function deleteSelectedWorkers",
    "async function rotateWorkerKey",
  );

  assert.match(source, /workerCatalogCompanyId === effectiveCompanyId/);
  assert.match(
    source,
    /workerCatalogCompanyId !== requestedCompanyId[\s\S]*?resolveWorkerCompanyId\(worker\)/,
  );
  assertBefore(edit, "isWorkerCertifiedForMutation", "mutateWorker<Worker>");
  assertBefore(remove, "isWorkerCertifiedForMutation", "apiFetch(");
  assertBefore(rotate, "isWorkerCertifiedForMutation", "apiFetch<");
  assertBefore(bulk, "workerCatalogCertified", "for (const worker of targets)");
  assert.match(bulk, /setSelectedWorkerIds\(failedIds\)/);
  assert.doesNotMatch(bulk, /Promise\.all/);
});

test("Visões isola catálogos, seleções e widgets por empresa sem recarregar por aba", () => {
  const source = readSource("components/app/views-manager.tsx");

  assert.match(
    source,
    /scenarioCatalog\.companyId === companyScopeId[\s\S]*?scenarioCatalog\.rows/,
  );
  assert.match(
    source,
    /viewWidgetWorkspace\.companyId === companyScopeId[\s\S]*?viewWidgetWorkspace\.widgets/,
  );
  assert.match(source, /selectedScenarioIdsForScope/);
  assert.match(source, /widgetSelectedScenarioIdsForScope/);
  assert.match(source, /setViewWidgetWorkspace\(\{ companyId: companyScopeId, widgets: \[\] \}\)/);
  assert.match(source, /updateViewWidgets\(\(current\) =>/);
  assert.doesNotMatch(source, /workspaceTab !== "view-builder"/);
  assert.match(
    source,
    /\}, \[companyScopeId, masterCrossCompanyScope\]\);/,
    "o catálogo deve carregar uma vez por escopo, não a cada troca de aba",
  );
});

test("Widgets salvos usam seleção compartilhada, confirmação e dependências estáveis", () => {
  const source = readSource("components/app/widget-view-presets.tsx");

  assert.match(source, /const currentScopeId = currentScope\?\.id \?\? ""/);
  assert.match(source, /const currentScopeName = currentScope\?\.name \?\? ""/);
  assert.match(
    source,
    /\[currentScopeId, currentScopeName, menu\.label, open, refreshPresets\]/,
  );
  assert.match(source, /checked=\{presetSelectionState\}/);
  assert.match(source, /setBulkDeleteConfirm\(true\)/);
  assert.match(source, /saveWidgetViewPresets\([\s\S]*?storedPresets\.filter/);
  assert.match(
    source,
    /new Set\(\[[\s\S]*?\.\.\.current,[\s\S]*?\.\.\.visibleScopes\.map/,
    "selecionar resultados filtrados deve preservar destinos ocultos",
  );
  assert.match(source, /Todos visíveis/);
});

test("Widgets salvos certificam empresa, usuário, menu e superfície antes de mutar", () => {
  const source = readSource("components/app/widget-view-presets.tsx");

  assert.match(
    source,
    /return JSON\.stringify\(\[\s*companyId\?\.trim\(\) \?\? "",\s*userId\?\.trim\(\) \?\? "",\s*menuKey,\s*surface/,
  );
  assert.match(
    source,
    /const presetCatalogCertified =\s*open && loadedPresetScopeKey === presetScopeKey/,
  );
  assert.match(
    source,
    /const presets = presetCatalogCertified \? storedPresets : EMPTY_PRESETS/,
  );
  assert.match(
    source,
    /const sourcePresetGroups = presetCatalogCertified[\s\S]*?EMPTY_SOURCE_PRESET_GROUPS/,
  );
  assert.match(source, /disabled=\{!presetCatalogCertified\}/);

  const scopeReset = between(
    source,
    "React.useLayoutEffect(() => {",
    "const refreshPresets = React.useCallback",
  );
  for (const reset of [
    'loadedPresetScopeKeyRef.current = ""',
    'setLoadedPresetScopeKey("")',
    "setStoredPresets([])",
    "setStoredSourcePresetGroups([])",
    "setDeleteId(null)",
    "setBulkDeleteConfirm(false)",
    "setSelectedPresetIds(new Set())",
    "setReplicateId(null)",
  ]) {
    assert.match(scopeReset, new RegExp(escapeRegExp(reset)));
  }

  const refresh = between(
    source,
    "const refreshPresets = React.useCallback",
    "React.useEffect(() => {",
  );
  assertBefore(
    refresh,
    "currentPresetScopeKeyRef.current !== requestedScopeKey",
    "setStoredPresets(nextPresets)",
  );
  assertBefore(
    refresh,
    "loadedPresetScopeKeyRef.current = requestedScopeKey",
    "setLoadedPresetScopeKey(requestedScopeKey)",
  );

  for (const [start, end, mutation] of [
    ["function saveCurrentView", "function updatePreset", "upsertWidgetViewPreset"],
    ["function updatePreset", "function applyToCurrent", "upsertWidgetViewPreset"],
    ["function applyToCurrent", "function applySourcePreset", "applyWidgetViewPreset"],
    ["function toggleDefault", "function confirmDelete", "setDefaultWidgetViewPreset"],
    ["function confirmDelete", "function togglePresetSelection", "deleteWidgetViewPreset"],
    ["function deleteSelectedPresets", "function startReplication", "saveWidgetViewPresets"],
    ["function replicatePreset", "function applyPresetToScopes", "applyPresetToScopes"],
  ]) {
    const action = between(source, start, end);
    assertBefore(action, "requireCertifiedPresetScope", mutation);
  }
  assert.match(
    source,
    /companyId: scope\.companyId,[\s\S]*?presetNamespace: scope\.presetNamespace/,
  );
  assert.match(
    source,
    /async function scheduleReload\(scope: CertifiedPresetScope\)[\s\S]*?currentPresetScopeKeyRef\.current !== scope\.key/,
  );
});

test("Video wall limpa seleção entre escopos e rejeita cenário fora do catálogo atual", () => {
  const source = readSource("components/app/video-wall-manager.tsx");

  assert.match(source, /loadedConfigurationScopeKey === configurationScopeKey/);
  assert.match(source, /setSelectedOutputIds\(new Set\(\)\)/);
  assert.match(source, /setSelectedSavedViewIds\(new Set\(\)\)/);
  assert.match(source, /wallWindowsRef\.current\.clear\(\)/);
  assert.match(
    source,
    /!scenarios\.some\(\(scenario\) => scenario\.id === output\.scenarioId\)/,
  );
  assert.match(source, /retainAvailableIds/);
  assert.match(source, /checked=\{outputSelectionState\}/);
  assert.match(source, /checked=\{savedViewSelectionState\}/);
});

test("Persistência em lote de visões remove somente IDs escolhidos no escopo pessoal", () => {
  const source = readSource("lib/video-wall.ts");
  const bulkDelete = between(
    source,
    "export function deleteSavedLiveViews",
    "export function loadVideoWallProfiles",
  );

  assert.match(bulkDelete, /new Set\([\s\S]*?viewId\.trim\(\)/);
  assert.match(bulkDelete, /loadSavedLiveViews\(companyId, userId\)\.filter/);
  assert.match(bulkDelete, /!selectedIds\.has\(view\.id\)/);
  assert.match(bulkDelete, /writeSavedLiveViews\(next, companyId, userId\)/);
  assert.match(
    source,
    /getUserViewScopedStorageKey\([\s\S]*?SAVED_VIEWS_STORAGE_KEY[\s\S]*?companyId,[\s\S]*?userId/,
  );
  assert.match(source, /requestUserGridSync\(\)/);
});

function readSource(pathname) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `marcador inicial ausente: ${startMarker}`);
  assert.notEqual(end, -1, `marcador final ausente: ${endMarker}`);
  return source.slice(start, end);
}

function assertBefore(source, earlier, later) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  assert.notEqual(earlierIndex, -1, `contrato ausente: ${earlier}`);
  assert.notEqual(laterIndex, -1, `contrato ausente: ${later}`);
  assert.ok(
    earlierIndex < laterIndex,
    `${earlier} precisa ser executado antes de ${later}`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
