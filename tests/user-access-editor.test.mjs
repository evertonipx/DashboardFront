import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function execute(path) {
  const compiled = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", compiled)(compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { buildUserAccessEditorGroups, userAccessEditorPermissionKeys } = execute("lib/user-access-editor.ts");
const { enabledCompanyAdminOperationalSlugs, isCertifiedCompanyAdminState } = execute("lib/company-admin-permission-policy.ts");

function option(family, capability, overrides = {}) {
  const moduleId = `module-${family}`;
  const slug = `access:${moduleId}:${capability}`;
  return {
    action: "view", category: "product", capability, family,
    description: "Consultar os painéis.", group_key: `product:${family}`,
    group_name: family, id: `permission-${capability}`, label: capability,
    module_id: moduleId, module_name: family, module_slug: family, slug,
    slugs: [capability], grants: [{ id: `permission-${capability}`, module_id: moduleId, slug: capability }],
    surface: null, ...overrides,
  };
}
const group = (groups, id = "product:counting") => groups.find((candidate) => candidate.id === id);

test("editor sempre identifica as três telas dos três produtos e os menus solicitados", () => {
  const groups = buildUserAccessEditorGroups([], {});
  assert.deepEqual(groups.slice(0, 3).map((item) => item.label), ["Contagem", "Ocupação", "Demográfico"]);
  for (const item of groups.slice(0, 3)) {
    assert.deepEqual(item.options.map((row) => row.label), ["Ao vivo", "Análises", "Relatórios"]);
    assert.ok(item.options.every((row) => row.disabled && !row.checked && row.permissionKeys.length === 0));
  }
  assert.deepEqual(group(groups, "menus").options.map((row) => row.label), [
    "Auditoria", "Visões", "Workers", "Câmeras", "Locais", "Cenários de Contagem", "Cenários de Ocupação", "Configurar widgets",
  ]);
});

test("permissão legada mostra três seleções vinculadas ao mesmo grant, sem inventar permissões", () => {
  const legacy = option("counting", "counting_view");
  const item = group(buildUserAccessEditorGroups([legacy], { [legacy.slug]: true }));
  assert.equal(item.options.length, 3);
  assert.ok(item.options.every((row) => row.linked && row.checked && !row.disabled));
  for (const row of item.options) {
    assert.deepEqual(userAccessEditorPermissionKeys(item, row.id), [legacy.slug]);
  }
  assert.deepEqual(userAccessEditorPermissionKeys(item), [legacy.slug]);
});

test("permissões granulares mantêm os controles de cada tela independentes", () => {
  const options = ["live", "analytics", "reports"].map((surface) => option("occupancy", `occupancy_${surface}_view`, { surface }));
  const item = group(buildUserAccessEditorGroups(options, { [options[1].slug]: true }), "product:occupancy");
  assert.deepEqual(item.options.map((row) => row.checked), [false, true, false]);
  assert.ok(item.options.every((row) => !row.linked && !row.disabled));
  assert.deepEqual(userAccessEditorPermissionKeys(item, "reports"), [options[2].slug]);
});

test("acesso conjunto existente não finge que uma tela pode ser revogada individualmente", () => {
  const legacy = option("counting", "counting_view");
  const specific = option("counting", "counting_live_view", { surface: "live" });
  const item = group(buildUserAccessEditorGroups([legacy, specific], { [legacy.slug]: true }));
  const live = item.options.find((row) => row.id === "live");
  assert.equal(live.checked, true);
  assert.equal(live.disabled, true);
  assert.deepEqual(userAccessEditorPermissionKeys(item, "live"), []);
  assert.deepEqual(userAccessEditorPermissionKeys(item, "all-screens"), [legacy.slug]);
  assert.deepEqual(new Set(userAccessEditorPermissionKeys(item)), new Set([legacy.slug, specific.slug]));
});

test("seleção do grupo limpa também grants específicos cobertos por gestão", () => {
  const management = option("demographics", "demographics_manage", { action: "manage" });
  const live = option("demographics", "demographics_live_view", { surface: "live" });
  const item = group(buildUserAccessEditorGroups([management, live], { [management.slug]: true, [live.slug]: true }), "product:demographics");
  assert.ok(item.options.slice(0, 3).every((row) => row.disabled && row.checked));
  assert.deepEqual(new Set(userAccessEditorPermissionKeys(item)), new Set([management.slug, live.slug]));
});

test("nenhuma seleção individual ou em grupo atribui módulo indisponível", () => {
  const disabled = option("occupancy", "occupancy_view", { unavailable: true });
  const item = group(buildUserAccessEditorGroups([disabled], {}), "product:occupancy");
  assert.deepEqual(userAccessEditorPermissionKeys(item), []);
  assert.deepEqual(userAccessEditorPermissionKeys(item, "live"), []);
});

test("recursos de dois módulos não compartilham a seleção", () => {
  const first = option("counting", "workers_manage", { category: "administrative" });
  const second = option("occupancy", "workers_manage", { category: "administrative" });
  const item = group(buildUserAccessEditorGroups([first, second], { [first.slug]: true }), "menus");
  const rows = item.options.filter((row) => row.label === "Workers");
  assert.deepEqual(rows.map((row) => row.checked), [true, false]);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.deepEqual(userAccessEditorPermissionKeys(item, rows[1].id), [second.slug]);
});

test("Admin seleciona todos os acessos reais dos módulos habilitados sem conceder o módulo desabilitado", () => {
  const enabled = new Set(["module-counting", "module-demographics"]);
  const options = [
    option("counting", "counting_view"), option("counting", "workers_manage", { category: "administrative" }),
    option("occupancy", "occupancy_view", { unavailable: true }),
    option("demographics", "demographics_view"),
  ];
  const state = Object.fromEntries(options.filter((item) => enabled.has(item.module_id)).map((item) => [item.slug, true]));
  assert.equal(isCertifiedCompanyAdminState(state, options, enabled), true);
  assert.deepEqual(enabledCompanyAdminOperationalSlugs(options, enabled), ["counting_view", "workers_manage", "demographics_view"]);
  const groups = buildUserAccessEditorGroups(options, state);
  assert.ok(group(groups).options.every((row) => row.checked));
  assert.ok(group(groups, "product:demographics").options.every((row) => row.checked));
  assert.ok(group(groups, "product:occupancy").options.every((row) => !row.checked && row.disabled));
});

test("auditoria conserva a restrição exclusiva do Superadmin enquanto não houver mudança autorizada", () => {
  const item = group(buildUserAccessEditorGroups([], {}), "menus");
  const audit = item.options.find((row) => row.id === "audit");
  assert.equal(audit.disabled, true);
  assert.match(audit.description, /Superadmin/);
  assert.deepEqual(userAccessEditorPermissionKeys(item, "audit"), []);
});

test("gestão vinculada ao módulo não apresenta as telas liberadas como desmarcadas", () => {
  const resource = option("occupancy", "occupancy_manage", { action: "manage", category: "administrative" });
  const item = group(buildUserAccessEditorGroups([resource], { [resource.slug]: true }), "product:occupancy");
  assert.ok(item.options.every((row) => row.checked && row.disabled));
  assert.ok(item.options.every((row) => /recursos de gestão/.test(row.description)));
  assert.deepEqual(userAccessEditorPermissionKeys(item), []);
});

test("Master integra a grade e impede alterações com salvamento ou escopo não certificado", () => {
  const source = read("components/app/super-admin-dashboard.tsx");
  assert.match(source, /<UserAccessGrid/);
  assert.match(source, /buildUserAccessEditorGroups\(visiblePermissionOptions, userPermissions\)/);
  assert.match(source, /function setPermissionAccess[\s\S]*?loadingUserPermissions \|\| saving[\s\S]*?userPermissionBaselineCertified/);
  assert.match(source, /createUserAccessPermissionState\(permissions, options\)/);
  assert.match(source, /resolveUserAccessCatalog\(catalog, modules\)/);
});
