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
const { canViewModuleSurface } = loadModule("lib/permissions.ts");
const { buildUserAccessEditorGroups, userAccessEditorPermissionKeys } = loadModule("lib/user-access-editor.ts");
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

test("slug opaco com módulo ativo e leitura explícita conserva o acesso já aceito no runtime", () => {
  for (const [module, family] of [[counting, "counting"], [occupancy, "occupancy"], [demographics, "demographics"]]) {
    for (const action of ["view", "read", "list", "export"]) {
      for (const slug of ["catalog_permission_created_by_backend", "8beadff0-5e78-4e6f-8631-f754ad7e53d6", action]) {
        const permission = grant("backend-permission-id", slug, module, action);
        const before = structuredClone(permission);
        const [option, ...remaining] = resolveUserAccessCatalog([permission], [module]);
        assert.ok(option, `${family}/${action}/${slug}`);
        assert.deepEqual(remaining, []);
        assert.equal(option.capability, `${family}_view`);
        assert.equal(option.surface, null);
        assert.equal(option.action, "view");
        assert.deepEqual(option.slugs, [slug]);
        assert.deepEqual(option.grants, [{ id: permission.id, module_id: module.id, slug }]);
        for (const surface of ["live", "analytics", "reports"]) {
          assert.equal(canViewModuleSurface(catalogUser(permission), family, surface), true);
        }
        assert.deepEqual(permission, before);
      }
    }
  }
});

test("Demográfico opaco habilita três controles vinculados sem fabricar IDs ou slugs", () => {
  const permission = grant("demographic-backend-id", "catalog_permission_created_by_backend", demographics, "view");
  const options = resolveUserAccessCatalog([permission], [demographics]);
  const [option] = options;
  assert.equal(options.length, 1);
  for (const selected of [false, true]) {
    const state = createUserAccessPermissionState(selected ? [permission] : [], options);
    const group = buildUserAccessEditorGroups(options, state).find((item) => item.id === "product:demographics");
    assert.equal(group.options.length, 3);
    assert.ok(group.options.every((item) => !item.disabled && item.linked && item.checked === selected));
    for (const item of group.options) {
      assert.deepEqual(userAccessEditorPermissionKeys(group, item.id), [option.slug]);
    }
    assert.deepEqual(userAccessEditorPermissionKeys(group), [option.slug]);
  }
  assert.deepEqual(option.grants, [{ id: permission.id, module_id: demographics.id, slug: permission.slug }]);
  const unavailable = [{ ...option, unavailable: true }];
  const unavailableState = createUserAccessPermissionState([permission], unavailable);
  const unavailableGroup = buildUserAccessEditorGroups(unavailable, unavailableState)
    .find((item) => item.id === "product:demographics");
  assert.ok(unavailableGroup.options.every((item) => item.disabled && !item.checked));
  assert.deepEqual(userAccessEditorPermissionKeys(unavailableGroup), []);
});

test("fallback opaco exige metadados e admite catálogo de módulos parcial sem criar módulos", () => {
  const permission = grant("backend-id", "catalog_permission_created_by_backend", demographics, "view");
  const embedded = resolveUserAccessCatalog([permission], []);
  const hydrated = resolveUserAccessCatalog([{ ...permission, module: undefined }], [demographics]);
  assert.equal(embedded.length, 1);
  assert.deepEqual(hydrated, embedded);
  assert.deepEqual(resolveUserAccessCatalog([{ ...permission, module: undefined }], []), []);
  assert.deepEqual(resolveUserAccessCatalog([grant("unknown-module", permission.slug, workerModule, "view")], [workerModule]), []);
});

test("fallback não converte recursos desconhecidos nem ações contraditórias em acesso geral", () => {
  const denied = [
    ["demographics_access", "view"],
    ["demographics_future_dashboard_view", "view"],
    ["catalog_demographics_permission", "view"],
    ["future_camera_view", "view"],
    ["audit_view", "view"],
    ["catalog_manage", "view"],
    ["catalog_create", "view"],
    ["manage", "view"],
    ["view", "manage"],
    ["catalog_permission_created_by_backend", "manage"],
    ["catalog_permission_created_by_backend", "unknown"],
    ["catalog_permission_created_by_backend", "view delete"],
    ["catalog_permission_created_by_backend", undefined],
  ];
  for (const [slug, action] of denied) {
    assert.deepEqual(resolveUserAccessCatalog([grant("denied-id", slug, demographics, action)], [demographics]), [], `${slug}/${action}`);
  }
});

test("termos de superfície malformados ou ambíguos nunca viram pacote opaco das três telas", () => {
  for (const slug of [
    "catalog_analytics", "catalog_analysis", "catalog_análises", "catalog_live", "catalog_real_time",
    "catalog_ao_vivo", "catalog_reports", "catalog_relatórios", "live_reports", "catalog_live_reports_view",
  ]) {
    const permission = grant("denied-surface", slug, demographics, "view");
    assert.deepEqual(resolveUserAccessCatalog([permission], [demographics]), [], slug);
    for (const surface of ["live", "analytics", "reports"]) {
      assert.equal(canViewModuleSurface(catalogUser(permission), "demographics", surface), false, `${slug}/${surface}`);
    }
  }
  const [granular] = resolveUserAccessCatalog([grant("real-analytics", "analytics_view", demographics, "view")], [demographics]);
  assert.equal(granular.surface, "analytics");
});

test("fallback opaco preserva bloqueios de módulo, identidade, flags e escopo da empresa", () => {
  const permission = grant("backend-id", "catalog_permission_created_by_backend", demographics, "view");
  assert.deepEqual(resolveUserAccessCatalog([permission], [{ ...demographics, active: false }]), []);
  for (const invalid of [
    { ...permission, module: { ...demographics, active: false } },
    { ...permission, module: { ...demographics, name: "Ocupação" } },
    { ...permission, module_id: occupancy.id },
    { ...permission, module: { ...occupancy, id: demographics.id } },
    { ...permission, id: "" },
  ]) {
    assert.deepEqual(resolveUserAccessCatalog([invalid], [demographics, occupancy]), []);
  }
  const options = resolveUserAccessCatalog([permission], [demographics]);
  const [option] = options;
  assert.ok(option);
  assert.equal(createUserAccessPermissionState([{ ...permission, can_view: false, can_export: false }], options)[option.slug], false);
  assert.equal(createUserAccessPermissionState([{ ...permission, module_id: occupancy.id }], options)[option.slug], false);
  for (const denied of [
    catalogUser({ ...permission, company_id: "other-company" }),
    catalogUser({ ...permission, can_view: false, can_export: false }),
    catalogUser({ ...permission, module_id: occupancy.id }),
    { ...catalogUser(permission), company_modules: [] },
    { ...catalogUser(permission), company_modules: [{ module_id: demographics.id, enabled: false, module: demographics }] },
  ]) {
    for (const surface of ["live", "analytics", "reports"]) {
      assert.equal(canViewModuleSurface(denied, "demographics", surface), false);
    }
  }
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

function catalogUser(permission) {
  return {
    id: "operator-id", name: "Operador", email: "operator@example.invalid",
    is_master: false, role: "operator", company_id: "current-company", permissions: [permission],
  };
}

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
