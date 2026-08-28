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
const access = loadTypeScriptModule("lib/access.ts");

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

test("grant administrativo do módulo libera o layout, sem ampliar recursos sensíveis", () => {
  const countingWrite = permission({
    action: "manage",
    module: {
      active: true,
      id: "module-counting",
      name: "Contagem",
      slug: "people-counting",
    },
    slug: "counting_manage",
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
  assert.equal(permissions.canManageWidgets(admin), true);
  assert.equal(permissions.canManageViews(admin), false);
  assert.equal(permissions.canManageWorkers(admin), false);
  assert.equal(permissions.canManageCameras(admin), false);
  assert.equal(permissions.canManageLocations(admin), false);
  assert.equal(permissions.canManageScenarios(admin), false);
  assert.equal(permissions.canManageOccupancy(admin), false);
});

test("Admin gerencia somente cada recurso concedido explicitamente", () => {
  const capabilityChecks = [
    ["dashboard_widgets_manage", "canManageWidgets"],
    ["views_manage", "canManageViews"],
    ["workers_manage", "canManageWorkers"],
    ["cameras_manage", "canManageCameras"],
    ["locations_manage", "canManageLocations"],
    ["scenarios_manage", "canManageScenarios"],
    ["occupancy_manage", "canManageOccupancy"],
  ];

  for (const [slug, selectedCheck] of capabilityChecks) {
    const admin = user({
      role: "admin",
      permissions: [permission({ action: "manage", slug })],
    });

    for (const [, check] of capabilityChecks) {
      const widgetComesWithModuleAdministration =
        slug === "occupancy_manage" && check === "canManageWidgets";
      assert.equal(
        permissions[check](admin),
        check === selectedCheck || widgetComesWithModuleAdministration,
        `${slug} não pode liberar ${check}`,
      );
    }
  }
});

test("Admin de Contagem também pode configurar os widgets do módulo", () => {
  const admin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "counting_manage" })],
  });

  assert.equal(permissions.canManageWidgets(admin), true);
  assert.equal(permissions.canManageWorkers(admin), false);
  assert.equal(permissions.canManageCameras(admin), false);
  assert.equal(permissions.canManageLocations(admin), false);
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

test("Operador nunca gerencia recursos mesmo com todos os grants explícitos", () => {
  const operator = user({
    role: "operator",
    permissions: permissions.OPERATIONAL_PERMISSIONS.map(({ slug }) =>
      permission({ action: "manage", slug }),
    ),
  });

  for (const check of [
    "canManageWidgets",
    "canManageViews",
    "canManageWorkers",
    "canManageCameras",
    "canManageLocations",
    "canManageScenarios",
    "canManageOccupancy",
  ]) {
    assert.equal(permissions[check](operator), false, check);
  }
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

test("módulo desabilitado na empresa bloqueia visualização e não amplia recursos", () => {
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
  assert.equal(permissions.canManageWidgets(disabledAdmin), false);
  assert.equal(permissions.canManageWorkers(disabledAdmin), false);
  assert.equal(permissions.canViewCounting(enabledAdmin), true);
  assert.equal(permissions.canManageWidgets(enabledAdmin), true);
  assert.equal(permissions.canManageWorkers(enabledAdmin), false);

  const authSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  assert.match(
    authSource,
    /hydrateUserCompanyModules\(user, authenticatedSession\)/,
  );
  assert.match(authSource, /"\/company\/modules"[\s\S]*?jwtCompanyScopeOnly: true/);
  assert.match(
    authSource,
    /async function hydrateUserCompanyModules[\s\S]*?catch \(error\) \{[\s\S]*?currentUserSessionIsCurrent\(authenticatedSession\)[\s\S]*?return \[\];/,
  );
});

test("Ao Vivo, Análises e Relatórios formam um pacote de visualização por módulo", () => {
  const master = user({ is_master: true, permissions: [] });
  const countingOperator = user({
    permissions: [permission({ action: "view", slug: "counting_view" })],
  });
  const occupancyOperator = user({
    permissions: [permission({ action: "view", slug: "occupancy_view" })],
  });
  const resourceOnlyAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "workers_manage" })],
  });

  assert.equal(permissions.canAccessOperationalDashboards(master), true);
  assert.equal(
    permissions.canAccessOperationalDashboards(countingOperator),
    true,
  );
  assert.equal(
    permissions.canAccessOperationalDashboards(occupancyOperator),
    true,
  );
  assert.equal(
    permissions.canAccessOperationalDashboards(resourceOnlyAdmin),
    false,
  );

  const shellSource = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  const packageGuards = shellSource.match(
    /canShow:\s*canAccessOperationalDashboards/g,
  );
  assert.equal(
    packageGuards?.length,
    6,
    "os três itens dos menus client e manager devem compartilhar o mesmo guard",
  );
});

test("redirecionamento escolhe a primeira tela realmente autorizada", () => {
  const master = user({ is_master: true });
  const viewsAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "views_manage" })],
  });
  const workersAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "workers_manage" })],
  });
  const countingAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "counting_manage" })],
  });
  const operator = user({
    permissions: [permission({ action: "view", slug: "counting_view" })],
  });

  assert.equal(access.resolveAuthorizedHomePath(master), "/manager/master");
  assert.equal(access.resolveAuthorizedHomePath(viewsAdmin), "/manager/views");
  assert.equal(access.resolveAuthorizedHomePath(workersAdmin), "/manager/workers");
  assert.equal(access.resolveAuthorizedHomePath(countingAdmin), "/manager/live");
  assert.equal(access.resolveAuthorizedHomePath(operator), "/dashboard/live");
});

test("tenant ou módulo desabilitado também bloqueia grant granular", () => {
  const viewsGrant = permission({
    action: "manage",
    company_id: "company-current",
    module_id: "module-views",
    module: {
      active: true,
      id: "module-views",
      name: "Views",
      slug: "views",
    },
    slug: "views_manage",
  });
  const assignment = {
    company_id: "company-current",
    enabled: false,
    module_id: "module-views",
    module: viewsGrant.module,
  };

  assert.equal(
    permissions.canManageViews(
      user({ role: "admin", permissions: [viewsGrant], company_modules: [assignment] }),
    ),
    false,
  );
  assert.equal(
    permissions.canManageViews(
      user({
        role: "admin",
        permissions: [viewsGrant],
        company_modules: [{ ...assignment, enabled: true }],
      }),
    ),
    true,
  );
  assert.equal(
    permissions.canManageViews(
      user({
        role: "admin",
        permissions: [{ ...viewsGrant, company_id: "company-foreign" }],
      }),
    ),
    false,
  );
});

test("Dashboard monta somente módulos concedidos e corrige seleção persistida", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/dashboard-module-tabs.tsx"),
    "utf8",
  );

  assert.match(source, /canViewCounting\(user\)/);
  assert.match(source, /canViewOccupancy\(user\)/);
  assert.match(source, /useEffectiveCompanyScopeId\(user\)/);
  assert.match(
    source,
    /dashboardModuleStorageKey\(companyScopeId, user\?\.id\)/,
  );
  assert.match(
    source,
    /availableModules\.includes\("counting"\)[\s\S]*?<TabsContent[\s\S]*?value="counting"/,
  );
  assert.match(
    source,
    /availableModules\.includes\("occupancy"\)[\s\S]*?<TabsContent[\s\S]*?value="occupancy"/,
  );
  assert.match(source, /persistDashboardModuleSelection\(storageKey, selection\)/);
  assert.match(
    source,
    /allowInitialQueryModule = activeStorageKeyRef\.current === null[\s\S]*?synchronize\(false\)/,
    "a query da empresa anterior não pode sobrescrever a preferência da nova empresa",
  );
  assert.match(source, /claimLegacyUserGridPreference\(DASHBOARD_MODULE_STORAGE_KEY/);
  assert.match(source, /data-dashboard-module="none"/);
  assert.match(source, /Nenhum módulo disponível/);
});

test("configuração IA fica restrita ao Master e a rota client redireciona por perfil", () => {
  const guardSource = readFileSync(
    resolve(projectRoot, "components/app/auth-guard.tsx"),
    "utf8",
  );
  assert.doesNotMatch(guardSource, /case "insights"|canUseAiInsights/);

  const clientPage = readFileSync(
    resolve(projectRoot, "app/dashboard/insights/page.tsx"),
    "utf8",
  );
  const managerPage = readFileSync(
    resolve(projectRoot, "app/manager/insights/page.tsx"),
    "utf8",
  );
  assert.match(clientPage, /<AuthGuard>/);
  assert.doesNotMatch(clientPage, /AiInsightsDashboard|<AppShell/);
  assert.match(clientPage, /router\.replace\(/);
  assert.match(
    clientPage,
    /hasMasterAccess\(user\)[\s\S]*?"\/manager\/insights"[\s\S]*?isManager[\s\S]*?"\/manager\/live"[\s\S]*?"\/dashboard\/live"/,
  );
  assert.match(managerPage, /<AuthGuard requireManager requireMaster>/);
  assert.match(managerPage, /title="Configuração IA"/);

  const shellSource = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  assert.doesNotMatch(shellSource, /href: "\/dashboard\/insights"/);
  assert.match(
    shellSource,
    /href: "\/manager\/insights",\s*label: "Configuração IA",\s*icon: BrainCircuit,\s*canShow: hasMasterAccess,\s*}/,
  );
  assert.match(
    shellSource,
    /min-h-0 flex-1 space-y-1 overflow-y-auto/,
    "a lista desktop deve rolar sem encobrir o rodapé da sidebar",
  );
});

test("catálogo de cenários abre para qualquer módulo sem misturar suas telas", () => {
  const countingAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "scenarios_manage" })],
  });
  const occupancyAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "occupancy_manage" })],
  });
  const broadModuleAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "counting_manage" })],
  });

  assert.equal(permissions.canManageScenarios(countingAdmin), true);
  assert.equal(permissions.canManageOccupancy(countingAdmin), false);
  assert.equal(permissions.canManageScenarioCatalogs(countingAdmin), true);
  assert.equal(permissions.canManageScenarios(occupancyAdmin), false);
  assert.equal(permissions.canManageOccupancy(occupancyAdmin), true);
  assert.equal(permissions.canManageScenarioCatalogs(occupancyAdmin), true);
  assert.equal(permissions.canManageScenarios(broadModuleAdmin), false);
  assert.equal(permissions.canManageScenarioCatalogs(broadModuleAdmin), false);

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
    /case "scenarios":[\s\S]*?canManageScenarioCatalogs\(user\)/,
  );
});

test("rota direta de Ocupação exige o módulo de visualização correspondente", () => {
  const occupancyPageSource = readFileSync(
    resolve(projectRoot, "app/dashboard/occupancy/page.tsx"),
    "utf8",
  );
  const guardSource = readFileSync(
    resolve(projectRoot, "components/app/auth-guard.tsx"),
    "utf8",
  );

  assert.match(
    occupancyPageSource,
    /<AuthGuard requireModule="occupancy">/,
  );
  assert.match(guardSource, /requireModule\?:\s*OperationalModuleFamily/);
  const moduleGuardSource = guardSource.slice(
    guardSource.indexOf("function canViewModule"),
  );
  assert.match(moduleGuardSource, /canViewCounting\(user\)/);
  assert.match(moduleGuardSource, /canViewOccupancy\(user\)/);
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
