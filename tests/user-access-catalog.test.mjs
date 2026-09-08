import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loadedModules = new Map();
const { resolveUserAccessCatalog, createUserAccessPermissionState, userAccessPermissionMatchesOption } = loadModule("lib/user-access-catalog.ts");
const counting = { id: "counting-id", slug: "people-counting", name: "Contagem", active: true };
const occupancy = { id: "occupancy-id", slug: "occupancy", name: "Ocupação", active: true };
const demographics = { id: "demographics-id", slug: "demographics", name: "Demographics", active: true };
const workerModule = { id: "worker-id", slug: "edge-workers", name: "Workers", active: true };

function grant(id, slug, module = counting, action) {
  return { id, slug, module_id: module.id, module, ...(action ? { action } : {}) };
}

test("permissões genéricas continuam um único pacote, com IDs e slugs reais", () => {
  const catalog = [grant("view-id", "counting_view"), grant("read-id", "counting_read"), grant("manage-id", "counting_manage")];
  const before = structuredClone(catalog);
  const options = resolveUserAccessCatalog(catalog, [counting]);
  assert.equal(options.length, 2);
  const reading = options.find((option) => option.capability === "counting_view");
  assert.equal(reading.surface, null);
  assert.deepEqual(reading.slugs, ["counting_view", "counting_read"]);
  assert.deepEqual(reading.grants.map(({ id }) => id), ["view-id", "read-id"]);
  assert.notEqual(reading.slug, "counting_view");
  assert.equal(options.find((option) => option.capability === "counting_manage").action, "manage");
  assert.deepEqual(catalog, before);
});

test("cada superfície real tem opção própria sem fabricar grants para as demais", () => {
  const options = resolveUserAccessCatalog([
    grant("live-id", "counting_live_view"),
    grant("analysis-id", "counting_analysis_read"),
    grant("report-id", "counting_reports_export"),
    grant("occupancy-live-id", "occupancy_realtime_view", occupancy),
    grant("demographic-report-id", "demographics_reports", demographics, "view"),
  ], [counting, occupancy, demographics]);
  assert.deepEqual(options.map((option) => option.surface), ["live", "analytics", "reports", "live", "reports"]);
  assert.ok(options.every((option) => option.grants.length === 1 && option.action === "view"));
  assert.equal(options.filter((option) => option.module_id === occupancy.id).length, 1);
});

test("a mesma capacidade em módulos distintos conserva seleção independente", () => {
  const options = resolveUserAccessCatalog([
    grant("counting-worker-id", "counting_manage_workers"),
    grant("worker-id", "workers_manage", workerModule),
  ], [counting, workerModule]);
  assert.equal(options.length, 2);
  assert.equal(options[0].capability, "workers_manage");
  assert.equal(options[1].capability, "workers_manage");
  assert.equal(options[0].module_name, "Contagem");
  assert.equal(options[1].module_name, "Workers");
  assert.equal(options[0].family, "counting");
  assert.equal(options[1].family, null);
  assert.equal(options[1].module_slug, workerModule.slug);
  assert.notEqual(options[0].slug, options[1].slug);
  const state = createUserAccessPermissionState([
    { id: "assignment-id", permission_id: "counting-worker-id", slug: "counting_manage_workers", module_id: counting.id },
  ], options);
  assert.deepEqual(state, { [options[0].slug]: true, [options[1].slug]: false });
});

test("aliases CRUD conhecidos são agrupados sem ampliar para catálogo desconhecido ou auditoria", () => {
  const options = resolveUserAccessCatalog([
    grant("camera-create", "counting_create_camera", counting, "create"),
    grant("camera-edit", "counting_edit_camera", counting, "edit"),
    grant("widget", "counting_manage_widgets"),
    grant("views", "counting_manage_views"),
    grant("unknown", "counting_future_dashboard_view", counting, "view"),
    grant("audit", "audit_view", workerModule, "view"),
  ], [counting, workerModule]);
  assert.deepEqual(options.map((option) => option.capability), ["cameras_manage", "dashboard_widgets_manage", "views_manage"]);
  assert.equal(options[0].grants.length, 2);
});

test("módulos inativos, referências divergentes e ações contraditórias falham fechados", () => {
  assert.deepEqual(resolveUserAccessCatalog([
    grant("inactive", "counting_view"),
  ], [{ ...counting, active: false }]), []);
  assert.deepEqual(resolveUserAccessCatalog([
    grant("embedded-inactive", "counting_view", { ...counting, active: false }),
    { ...grant("wrong-id", "counting_view"), module_id: occupancy.id },
    grant("wrong-family", "occupancy_view"),
    { ...grant("wrong-embedded-family", "counting_view"), module: { ...occupancy, id: counting.id } },
    grant("wrong-view-action", "counting_view", counting, "manage"),
    grant("wrong-action", "counting_view", counting, "unknown"),
    grant("wrong-management-action", "counting_create_camera", counting, "view"),
    grant("contradictory-metadata", "workers_manage", { ...counting, name: "Ocupação" }),
    grant("ambiguous", "counting_live_reports_view"),
    grant("unknown-surface-action", "counting_live_delete"),
    { id: "missing-module", slug: "counting_view" },
    { ...grant("missing-id", "counting_view"), id: "" },
  ], [counting, occupancy]), []);
});

test("metadados incorporados no catálogo bastam quando o catálogo de módulos é parcial", () => {
  const options = resolveUserAccessCatalog([grant("view-id", "occupancy_view", occupancy)], []);
  assert.equal(options.length, 1);
  assert.equal(options[0].module_id, occupancy.id);
  assert.equal(options[0].group_name, "Ocupação");
});

test("estado respeita flags explícitos, permissão real, módulo e indisponibilidade", () => {
  const options = resolveUserAccessCatalog([grant("view-id", "counting_view")], [counting]);
  const key = options[0].slug;
  assert.equal(createUserAccessPermissionState([grant("view-id", "counting_view")], options)[key], true);
  assert.equal(createUserAccessPermissionState([{ ...grant("view-id", "counting_view"), can_view: false, can_export: false }], options)[key], false);
  assert.equal(createUserAccessPermissionState([{ ...grant("view-id", "counting_view"), can_view: false, can_export: true }], options)[key], true);
  assert.equal(createUserAccessPermissionState([grant("view-id", "counting_view", occupancy)], options)[key], false);
  assert.equal(createUserAccessPermissionState([grant("view-id", "counting_view", { ...counting, active: false })], options)[key], false);
  assert.equal(createUserAccessPermissionState([{ id: "assignment", slug: "counting_view" }], options)[key], true);
  assert.equal(createUserAccessPermissionState([{ id: "assignment", slug: key }], options)[key], false);
  assert.equal(createUserAccessPermissionState([grant("view-id", "counting_view")], [{ ...options[0], unavailable: true }])[key], false);
});

test("registros duplicados idênticos não duplicam grants nem a seleção", () => {
  const permission = grant("view-id", "counting_view");
  const [option] = resolveUserAccessCatalog([permission, { ...permission }], [counting]);
  assert.equal(option.grants.length, 1);
  assert.deepEqual(option.slugs, [permission.slug]);
});

test("o mesmo slug literal em módulos ou IDs distintos é ambíguo para POST por slug", () => {
  const catalog = [
    grant("counting-worker", "workers_manage"),
    grant("occupancy-worker", "workers_manage", occupancy),
    grant("counting-view", "counting_view"),
  ];
  const options = resolveUserAccessCatalog(catalog, [counting, occupancy]);
  assert.deepEqual(options.map((option) => option.capability), ["counting_view"]);
  assert.deepEqual(resolveUserAccessCatalog([
    grant("view-one", "counting_view"), grant("view-two", "counting_view"),
  ], [counting]), []);
});

test("matching exportado certifica o módulo inclusive durante revogação", () => {
  const [option] = resolveUserAccessCatalog([grant("counting-view", "counting_view")], [counting]);
  assert.equal(userAccessPermissionMatchesOption({
    id: "assignment", permission_id: "counting-view", slug: "counting_view", module_id: counting.id,
  }, option), true);
  assert.equal(userAccessPermissionMatchesOption({
    id: "assignment", permission_id: "counting-view", slug: "counting_view", module_id: occupancy.id,
  }, option), false);
  assert.equal(userAccessPermissionMatchesOption({
    id: "assignment", permission_id: "counting-view", slug: "counting_view", module_id: counting.id, module: occupancy,
  }, option), false);
  assert.equal(userAccessPermissionMatchesOption({
    id: "assignment", permission_id: "counting-view", slug: "counting_view", module_id: counting.id, can_view: false,
  }, option), true, "um registro desativado ainda precisa ser localizável para remoção");
  assert.equal(userAccessPermissionMatchesOption({ id: "unknown", slug: option.slug }, option), false);
});

function loadModule(relativePath) {
  if (loadedModules.has(relativePath)) return loadedModules.get(relativePath);
  const filename = resolve(root, relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  const scopedRequire = (specifier) => specifier.startsWith("@/")
    ? loadModule(`${specifier.slice(2)}.ts`)
    : createRequire(filename)(specifier);
  new Function("exports", "require", "module", output)(loaded.exports, scopedRequire, loaded);
  loadedModules.set(relativePath, loaded.exports);
  return loaded.exports;
}
