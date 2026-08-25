import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const permissions = loadTypeScriptModule("lib/permissions.ts");

test("Master enxerga os dois módulos sem depender do catálogo de permissões", () => {
  const master = user({ is_master: true, permissions: [] });

  assert.equal(permissions.canViewCounting(master), true);
  assert.equal(permissions.canViewOccupancy(master), true);
  assert.equal(
    permissions.userHasModuleManagementPermission(master, "counting"),
    true,
  );
  assert.equal(
    permissions.userHasModuleManagementPermission(master, "occupancy"),
    true,
  );
});

test("visibilidade usa module.slug/name do Swagger sem hardcode de permission slug", () => {
  const countingPermission = permission({
    action: "view",
    module: {
      active: true,
      id: "module-counting",
      name: "People Counting",
      slug: "people-counting",
    },
    slug: "catalog_permission_created_by_backend",
  });
  const operator = user({ permissions: [countingPermission] });

  assert.equal(
    permissions.permissionModuleFamily(countingPermission),
    "counting",
  );
  assert.equal(permissions.canViewCounting(operator), true);
  assert.equal(permissions.canViewOccupancy(operator), false);
});

test("JWT compacto identifica o módulo pelo prefixo e a ação do slug", () => {
  const operator = user({
    permissions: [permission({ action: undefined, slug: "occupancy_view" })],
  });

  assert.equal(permissions.canViewCounting(operator), false);
  assert.equal(permissions.canViewOccupancy(operator), true);
});

test("grant somente leitura sem action nunca vira permissão de escrita", () => {
  const admin = user({
    role: "admin",
    permissions: [
      permission({ action: undefined, slug: "occupancy_view" }),
      permission({ action: undefined, slug: "counting_create_view" }),
    ],
  });

  assert.equal(permissions.canManageOccupancy(admin), false);
  assert.equal(permissions.canManageWidgets(admin), false);
  assert.equal(permissions.canManageViews(admin), true);
});

test("Admin só gerencia o módulo com grant mutável explícito", () => {
  const countingWrite = permission({
    action: "manage",
    module: {
      active: true,
      id: "module-counting",
      name: "Contagem",
      slug: "people-counting",
    },
    slug: "backend_generated_permission",
  });
  const occupancyRead = permission({
    action: "view",
    module: {
      active: true,
      id: "module-occupancy",
      name: "Ocupação",
      slug: "people-occupancy",
    },
    slug: "another_backend_permission",
  });
  const admin = user({
    role: "admin",
    permissions: [countingWrite, occupancyRead],
  });

  assert.equal(permissions.canViewCounting(admin), true);
  assert.equal(permissions.canViewOccupancy(admin), true);
  assert.equal(
    permissions.userHasModuleManagementPermission(admin, "counting"),
    true,
  );
  assert.equal(
    permissions.userHasModuleManagementPermission(admin, "occupancy"),
    false,
  );
  assert.equal(permissions.canManageWorkers(admin), true);
  assert.equal(permissions.canManageCameras(admin), true);
  assert.equal(permissions.canManageLocations(admin), true);
  assert.equal(permissions.canManageScenarios(admin), true);
  assert.equal(permissions.canManageOccupancy(admin), false);
});

test("Operador nunca recebe mutação e flags somente leitura vencem action conflitante", () => {
  const declaredReadOnly = permission({
    action: "manage",
    can_create: false,
    can_delete: false,
    can_edit: false,
    can_view: true,
    module: {
      active: true,
      id: "module-counting",
      name: "People Counting",
      slug: "people-counting",
    },
    slug: "runtime_permission",
  });
  const operator = user({
    role: "operator",
    permissions: [declaredReadOnly],
  });
  const admin = user({ role: "admin", permissions: [declaredReadOnly] });

  assert.equal(permissions.canViewCounting(operator), true);
  assert.equal(
    permissions.userHasModuleManagementPermission(operator, "counting"),
    false,
  );
  assert.equal(permissions.canManageWorkers(operator), false);
  assert.equal(permissions.canManageCameras(operator), false);
  assert.equal(permissions.canManageLocations(operator), false);
  assert.equal(
    permissions.userHasModuleManagementPermission(admin, "counting"),
    false,
  );
});

test("módulo ausente, inativo, contraditório ou de outro tenant falha fechado", () => {
  const noModule = user({
    permissions: [permission({ action: "view", slug: "reports_view" })],
  });
  const inactive = user({
    permissions: [
      permission({
        action: "view",
        module: {
          active: false,
          id: "module-counting",
          name: "People Counting",
          slug: "people-counting",
        },
        slug: "counting_view",
      }),
    ],
  });
  const contradictoryPermission = permission({
    action: "view",
    module: {
      active: true,
      id: "module-occupancy",
      name: "People Occupancy",
      slug: "people-occupancy",
    },
    slug: "counting_view",
  });
  const foreignTenant = user({
    permissions: [
      permission({ company_id: "company-foreign", slug: "counting_view" }),
    ],
  });

  assert.equal(permissions.canViewCounting(noModule), false);
  assert.equal(permissions.canViewOccupancy(noModule), false);
  assert.equal(permissions.canViewCounting(inactive), false);
  assert.equal(
    permissions.permissionModuleFamily(contradictoryPermission),
    null,
  );
  assert.equal(permissions.canViewCounting(foreignTenant), false);
});

test("módulo desabilitado na empresa bloqueia grant preservado", () => {
  const countingGrant = permission({
    action: "manage",
    module_id: "module-counting",
    module: {
      active: true,
      id: "module-counting",
      name: "People Counting",
      slug: "people-counting",
    },
    slug: "counting_manage",
  });
  const assignment = {
    company_id: "company-current",
    enabled: false,
    module_id: "module-counting",
    module: countingGrant.module,
  };
  const disabledAdmin = user({
    role: "admin",
    permissions: [countingGrant],
    company_modules: [assignment],
  });
  const enabledAdmin = user({
    role: "admin",
    permissions: [countingGrant],
    company_modules: [{ ...assignment, enabled: true }],
  });

  assert.equal(permissions.canViewCounting(disabledAdmin), false);
  assert.equal(permissions.canManageWorkers(disabledAdmin), false);
  assert.equal(permissions.canViewCounting(enabledAdmin), true);
  assert.equal(permissions.canManageWorkers(enabledAdmin), true);

  const authSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  assert.match(authSource, /hydrateUserCompanyModules\(user\)/);
  assert.match(authSource, /"\/company\/modules"[\s\S]*?jwtCompanyScopeOnly: true/);
  assert.match(
    authSource,
    /async function hydrateUserCompanyModules[\s\S]*?catch \{[\s\S]*?return \[\];/,
  );
});

test("Dashboard monta somente módulos concedidos e corrige seleção persistida", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/dashboard-module-tabs.tsx"),
    "utf8",
  );

  assert.match(source, /canViewCounting\(user\)/);
  assert.match(source, /canViewOccupancy\(user\)/);
  assert.match(
    source,
    /availableModules\.includes\("counting"\)[\s\S]*?<TabsContent[\s\S]*?value="counting"/,
  );
  assert.match(
    source,
    /availableModules\.includes\("occupancy"\)[\s\S]*?<TabsContent[\s\S]*?value="occupancy"/,
  );
  assert.match(source, /persistDashboardModuleSelection\(storageKey, selection\)/);
  assert.match(source, /data-dashboard-module="none"/);
  assert.match(source, /Nenhum módulo disponível/);
});

test("catálogo de cenários abre para qualquer módulo sem misturar suas telas", () => {
  const countingAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "counting_manage" })],
  });
  const occupancyAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "occupancy_manage" })],
  });

  assert.equal(permissions.canManageScenarios(countingAdmin), true);
  assert.equal(permissions.canManageOccupancy(countingAdmin), false);
  assert.equal(permissions.canManageScenarioCatalogs(countingAdmin), true);
  assert.equal(permissions.canManageScenarios(occupancyAdmin), false);
  assert.equal(permissions.canManageOccupancy(occupancyAdmin), true);
  assert.equal(permissions.canManageScenarioCatalogs(occupancyAdmin), true);

  const managerSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-manager.tsx"),
    "utf8",
  );
  assert.match(
    managerSource,
    /canEditScenarios \? <TabsContent value="flow">/,
  );
  assert.match(
    managerSource,
    /canEditOccupancy \? <TabsContent value="occupancy">[\s\S]*?<OccupancyScenarioManager \/>/,
  );
  assert.match(
    managerSource,
    /if \(!canEditScenarios \|\| !requestedCompanyScopeId\)/,
    "um Admin somente de Ocupação não deve consultar o catálogo de Contagem",
  );

  const shellSource = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  assert.match(shellSource, /canShow: canManageScenarioCatalogs/);

  const guardSource = readFileSync(
    resolve(projectRoot, "components/app/auth-guard.tsx"),
    "utf8",
  );
  assert.match(
    guardSource,
    /case "scenarios":[\s\S]*?canManageScenarios\(user\) \|\| canManageOccupancy\(user\)/,
  );
});

function user(overrides = {}) {
  return {
    company_id: "company-current",
    email: "user@example.com",
    id: "user-current",
    is_master: false,
    name: "User",
    role: "operator",
    ...overrides,
  };
}

function permission(overrides = {}) {
  return {
    id: `permission-${Math.random()}`,
    slug: "counting_view",
    ...overrides,
  };
}

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const cached = moduleCache.get(filename);
  if (cached) return cached.exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return nodeRequire(specifier);
    return loadTypeScriptModule(`${specifier.slice(2)}.ts`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
