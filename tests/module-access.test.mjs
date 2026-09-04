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

test("Master enxerga os três módulos sem depender do catálogo de permissões", () => {
  const master = user({ is_master: true, permissions: [] });

  assert.equal(permissions.canViewCounting(master), true);
  assert.equal(permissions.canViewOccupancy(master), true);
  assert.equal(permissions.canViewDemographics(master), true);
  assert.equal(
    permissions.userHasModuleManagementPermission(master, "counting"),
    true,
  );
  assert.equal(
    permissions.userHasModuleManagementPermission(master, "occupancy"),
    true,
  );
  assert.equal(
    permissions.userHasModuleManagementPermission(master, "demographics"),
    true,
  );
});

test("auditoria segue o papel administrativo certificado, fora dos módulos", () => {
  const master = user({ is_master: true, permissions: [] });
  const admin = user({ role: "admin", permissions: [] });
  const operator = user({ role: "operator", permissions: [] });

  assert.equal(permissions.canViewAudit(master), true);
  assert.equal(permissions.canViewAudit(admin), true);
  assert.equal(permissions.canViewAudit(operator), false);
  assert.equal(access.hasDeclaredManagerAccess(admin), true);
  assert.equal(access.resolveAuthorizedHomePath(admin), "/manager/audit");
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
  assert.equal(permissions.canViewDemographics(operator), false);
});

test("Demográfico deriva acesso do módulo retornado pelo Swagger/JWT", () => {
  const demographicPermission = permission({
    action: "view",
    module: {
      active: true,
      id: "module-demographics",
      name: "Demographics",
      slug: "demographics",
    },
    slug: "catalog_permission_created_by_backend",
  });
  const operator = user({ permissions: [demographicPermission] });

  assert.equal(
    permissions.permissionModuleFamily(demographicPermission),
    "demographics",
  );
  assert.equal(permissions.canViewCounting(operator), false);
  assert.equal(permissions.canViewOccupancy(operator), false);
  assert.equal(permissions.canViewDemographics(operator), true);
  assert.equal(permissions.canAccessOperationalDashboards(operator), true);
});

test("JWT compacto identifica o módulo pelo prefixo e a ação do slug", () => {
  const operator = user({
    permissions: [permission({ action: undefined, slug: "demographics_view" })],
  });

  assert.equal(permissions.canViewCounting(operator), false);
  assert.equal(permissions.canViewOccupancy(operator), false);
  assert.equal(permissions.canViewDemographics(operator), true);
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

test("Admin do Demográfico configura widgets sem receber acesso à infraestrutura", () => {
  const admin = user({
    role: "admin",
    permissions: [
      permission({ action: undefined, slug: "demographics_manage" }),
    ],
  });

  assert.equal(permissions.canViewDemographics(admin), true);
  assert.equal(
    permissions.userHasModuleManagementPermission(admin, "demographics"),
    true,
  );
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
  assert.equal(permissions.canViewDemographics(noModule), false);
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

test("atribuição da empresa também controla o módulo Demográfico", () => {
  const demographicsGrant = permission({
    action: "view",
    module_id: "module-demographics",
    module: {
      active: true,
      id: "module-demographics",
      name: "Demographics",
      slug: "demographics",
    },
    slug: "permission-from-catalog",
  });
  const assignment = {
    company_id: "company-current",
    enabled: false,
    module_id: "module-demographics",
    module: demographicsGrant.module,
  };

  assert.equal(
    permissions.canViewDemographics(
      user({ permissions: [demographicsGrant], company_modules: [assignment] }),
    ),
    false,
  );
  assert.equal(
    permissions.canViewDemographics(
      user({
        permissions: [demographicsGrant],
        company_modules: [{ ...assignment, enabled: true }],
      }),
    ),
    true,
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
  const demographicsOperator = user({
    permissions: [permission({ action: "view", slug: "demographics_view" })],
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
    permissions.canAccessOperationalDashboards(demographicsOperator),
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

test("lista JWT explícita exige assignment correspondente para grant granular", () => {
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
  const unrelatedAssignment = {
    company_id: "company-current",
    enabled: true,
    module_id: "module-demographics",
    module: {
      active: true,
      id: "module-demographics",
      name: "Demographics",
      slug: "demographics",
    },
  };

  assert.equal(
    permissions.canManageViews(
      user({ role: "admin", permissions: [viewsGrant], company_modules: [] }),
    ),
    false,
  );
  assert.equal(
    permissions.canManageViews(
      user({
        role: "admin",
        permissions: [viewsGrant],
        company_modules: [unrelatedAssignment],
      }),
    ),
    false,
  );
  assert.equal(
    permissions.canManageViews(
      user({ role: "admin", permissions: [viewsGrant] }),
    ),
    true,
    "JWT legado sem company_modules mantém compatibilidade",
  );
});

test("Dashboard monta somente módulos concedidos e corrige seleção persistida", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/dashboard-module-tabs.tsx"),
    "utf8",
  );

  assert.match(source, /canViewCounting\(user\)/);
  assert.match(source, /canViewOccupancy\(user\)/);
  assert.match(source, /canViewDemographics\(user\)/);
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
  assert.match(
    source,
    /availableModules\.includes\("demographics"\)[\s\S]*?<TabsContent[\s\S]*?value="demographics"/,
  );
  assert.match(
    source,
    /<TabsTrigger[\s\S]*?value="demographics"[\s\S]*?>[\s\S]*?Demographics[\s\S]*?<\/TabsTrigger>/,
    "o terceiro módulo deve usar o nome solicitado na navegação",
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

test("configuração IA fica unificada na Central do Superadmin", () => {
  const guardSource = readFileSync(
    resolve(projectRoot, "components/app/auth-guard.tsx"),
    "utf8",
  );
  const routeShellSource = readFileSync(
    resolve(projectRoot, "components/app/authenticated-route-shell.tsx"),
    "utf8",
  );
  const dashboardLayout = readFileSync(
    resolve(projectRoot, "app/dashboard/layout.tsx"),
    "utf8",
  );
  const managerLayout = readFileSync(
    resolve(projectRoot, "app/manager/layout.tsx"),
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
  assert.match(dashboardLayout, /<DashboardRouteShell>\{children\}<\/DashboardRouteShell>/);
  assert.match(routeShellSource, /export function DashboardRouteShell/);
  assert.doesNotMatch(routeShellSource, /pathname === "\/dashboard\/insights"/);
  assert.match(
    routeShellSource,
    /<AuthGuard[\s\S]*?<AppShell mode="client">\{children\}<\/AppShell>/,
  );
  assert.doesNotMatch(
    clientPage,
    /"use client"|AiInsightsDashboard|<AppShell|useRouter|useAuth/,
  );
  assert.match(clientPage, /import \{ redirect \} from "next\/navigation"/);
  assert.match(clientPage, /redirect\("\/manager\/master\?section=insights"\)/);
  assert.match(managerLayout, /<ManagerRouteShell>\{children\}<\/ManagerRouteShell>/);
  assert.match(routeShellSource, /const requireMaster = pathname === "\/manager\/master"/);
  assert.match(routeShellSource, /requireMaster=\{requireMaster\}/);
  assert.doesNotMatch(
    managerPage,
    /"use client"|AiInsightsDashboard|<AppShell|useRouter|useAuth/,
  );
  assert.match(managerPage, /import \{ redirect \} from "next\/navigation"/);
  assert.match(managerPage, /redirect\("\/manager\/master\?section=insights"\)/);

  const shellSource = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  assert.doesNotMatch(shellSource, /href: "\/dashboard\/insights"/);
  assert.doesNotMatch(shellSource, /href: "\/manager\/insights"|BrainCog/);
  const routePreloadSource = readFileSync(
    resolve(projectRoot, "lib/app-route-preload.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    routePreloadSource,
    /"\/manager\/insights"/,
    "o alias legado não deve baixar o painel de IA separado",
  );
  assert.match(
    shellSource,
    /href: "\/manager\/master", label: "Superadmin", icon: ShieldCheck/,
  );
  assert.match(shellSource, /title: "Central do Superadmin"/);
  assert.match(
    shellSource,
    /const isMasterWorkspace =[\s\S]*?pathname === "\/manager\/master"[\s\S]*?isMasterWorkspace[\s\S]*?`master-workspace-\$\{user\?\.id \?\? "anonymous"\}`/,
    "trocar a empresa dentro do Master não pode remontar toda a central",
  );
  assert.match(
    shellSource,
    /React\.useEffect\(\(\) => \{\s*if \(isMasterWorkspace\) return;[\s\S]*?migrateLegacyDashboardDefaults/,
    "selecionar empresa na central não deve consultar as visões legadas",
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

test("AuthGuard e o shell persistente reconhecem os três módulos operacionais", () => {
  const occupancyPageSource = readFileSync(
    resolve(projectRoot, "app/dashboard/occupancy/page.tsx"),
    "utf8",
  );
  const dashboardLayout = readFileSync(
    resolve(projectRoot, "app/dashboard/layout.tsx"),
    "utf8",
  );
  const routeShellSource = readFileSync(
    resolve(projectRoot, "components/app/authenticated-route-shell.tsx"),
    "utf8",
  );
  const guardSource = readFileSync(
    resolve(projectRoot, "components/app/auth-guard.tsx"),
    "utf8",
  );

  assert.match(
    dashboardLayout,
    /<DashboardRouteShell>\{children\}<\/DashboardRouteShell>/,
  );
  assert.match(
    routeShellSource,
    /requireModule=\{pathname === "\/dashboard\/occupancy" \? "occupancy" : undefined\}/,
  );
  assert.match(
    occupancyPageSource,
    /DeferredOccupancyScenarioDashboard as OccupancyScenarioDashboard/,
  );
  assert.match(guardSource, /requireModule\?:\s*OperationalModuleFamily/);
  const moduleGuardSource = guardSource.slice(
    guardSource.indexOf("function canViewModule"),
  );
  assert.match(moduleGuardSource, /canViewCounting\(user\)/);
  assert.match(moduleGuardSource, /canViewOccupancy\(user\)/);
  assert.match(moduleGuardSource, /canViewDemographics\(user\)/);
});

test("wrappers montam Demográfico somente dentro das abas autorizadas", () => {
  for (const [filename, surface] of [
    ["components/app/live-dashboard-tabs.tsx", "live"],
    ["components/app/analysis-dashboard.tsx", "analysis"],
    ["components/app/reports-dashboard.tsx", "reports"],
  ]) {
    const source = readFileSync(resolve(projectRoot, filename), "utf8");
    assert.match(
      source,
      new RegExp(
        `demographics=\\{[\\s\\S]*?<DemographicsDashboard[\\s\\S]*?surface="${surface}"`,
      ),
      filename,
    );
  }
});

test("gestão Master apresenta o terceiro módulo do catálogo com nome e ordem estáveis", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );

  assert.match(source, /type AlgorithmModuleFamily =[^;]*"demographics"/s);
  assert.match(
    source,
    /family: "demographics",\s*label: "Demographics"/,
  );
  assert.match(
    source,
    /if \(family === "occupancy"\) return 1;\s*return 2;/,
  );
  assert.match(source, /function selectVisibleProductModules/);
  assert.match(
    source,
    /const family = algorithmModuleFamily\(module\);\s*if \(!family\) return;/,
  );
  assert.match(source, /<CardTitle>Módulos/);
  assert.match(
    source,
    /<TabsTrigger value="modules"[\s\S]*?Módulos[\s\S]*?<\/TabsTrigger>/,
  );
  assert.match(
    source,
    /<TabsTrigger value="workers"[\s\S]*?Workers[\s\S]*?<\/TabsTrigger>/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:produto|produtos|coletor|coletores)\b/i,
    "a Central deve usar somente Módulos e Workers na nomenclatura visível",
  );
  assert.doesNotMatch(source, /module\.description \|\| module\.slug/);
  assert.doesNotMatch(source, /Nenhum algoritmo retornado pela API/);
  const moduleDefinitions = source.slice(
    source.indexOf("const algorithmModuleDefinitions"),
    source.indexOf("export function SuperAdminDashboard"),
  );
  for (const internalResource of [
    "alarms",
    "analytics",
    "audit log",
    "cameras",
    "edge workers",
    "heatmap",
    "locations",
    "qr code",
    "users",
  ]) {
    assert.doesNotMatch(
      moduleDefinitions,
      new RegExp(`"${internalResource}"`, "i"),
      `${internalResource} é recurso interno, não módulo operacional`,
    );
  }
  const enabledCountSource = source.slice(
    source.indexOf("function enabledCompanyModuleCount"),
    source.indexOf("function workerIsOnline"),
  );
  assert.match(enabledCountSource, /!algorithmModuleFamily\(catalogModule\)/);
});

test("Workers mantém nomenclatura, rota e autorização coerentes em toda a área administrativa", () => {
  const appShellSource = readFileSync(
    resolve(projectRoot, "components/app/app-shell.tsx"),
    "utf8",
  );
  const routeShellSource = readFileSync(
    resolve(projectRoot, "components/app/authenticated-route-shell.tsx"),
    "utf8",
  );
  const workerPageSource = readFileSync(
    resolve(projectRoot, "app/manager/workers/page.tsx"),
    "utf8",
  );
  const deferredPanelsSource = readFileSync(
    resolve(projectRoot, "components/app/deferred-route-panels.tsx"),
    "utf8",
  );
  const routePreloadSource = readFileSync(
    resolve(projectRoot, "lib/app-route-preload.ts"),
    "utf8",
  );
  const workerManagerSource = readFileSync(
    resolve(projectRoot, "components/app/worker-manager.tsx"),
    "utf8",
  );
  const permissionsSource = readFileSync(
    resolve(projectRoot, "lib/permissions.ts"),
    "utf8",
  );

  const managerNavigation = appShellSource.slice(
    appShellSource.indexOf("const managerNavItems"),
    appShellSource.indexOf("const masterNavItem"),
  );
  assert.match(
    managerNavigation,
    /href: "\/manager\/workers",\s*label: "Workers",[\s\S]*?canShow: canManageWorkers/,
    "o menu deve chamar o recurso de Workers e respeitar sua permissão",
  );

  const workerPresentationStart = appShellSource.indexOf('"/manager/workers":');
  const workerPresentation = appShellSource.slice(
    workerPresentationStart,
    appShellSource.indexOf("\n    },", workerPresentationStart) + 7,
  );
  assert.match(workerPresentation, /title: "Workers"/);
  assert.doesNotMatch(workerPresentation, /Dispositivos?/i);

  assert.match(routeShellSource, /"\/manager\/workers": "workers"/);
  assert.match(
    workerPageSource,
    /DeferredWorkerManager as WorkerManager[\s\S]*?return <WorkerManager \/>/,
  );
  assert.match(
    deferredPanelsSource,
    /DeferredWorkerManager[\s\S]*?import\("@\/components\/app\/worker-manager"\)[\s\S]*?module\.WorkerManager/,
  );
  assert.match(
    routePreloadSource,
    /"\/manager\/workers": \(\) => import\("@\/components\/app\/worker-manager"\)/,
  );

  const workerPermissionStart = permissionsSource.indexOf('slug: "workers_manage"');
  const workerPermission = permissionsSource.slice(
    workerPermissionStart,
    permissionsSource.indexOf("\n  },", workerPermissionStart) + 5,
  );
  assert.match(workerPermission, /label: "Workers"/);
  assert.doesNotMatch(workerPermission, /Dispositivos?/i);
  assert.doesNotMatch(
    workerManagerSource,
    /Dispositivos?/i,
    "a própria tela deve manter a mesma nomenclatura apresentada no menu",
  );

  const scopeResetEffect = workerManagerSource.indexOf(
    "workerMutationSequenceRef.current += 1",
  );
  const initialLoadEffect = workerManagerSource.indexOf("void loadWorkers();");
  assert.ok(scopeResetEffect >= 0 && initialLoadEffect >= 0);
  assert.ok(
    scopeResetEffect < initialLoadEffect,
    "o reset de escopo deve ocorrer antes da carga inicial para não invalidar a própria resposta",
  );

  const workersAdmin = user({
    role: "admin",
    permissions: [permission({ action: "manage", slug: "workers_manage" })],
  });
  const operator = user({
    role: "operator",
    permissions: [permission({ action: "manage", slug: "workers_manage" })],
  });
  assert.equal(permissions.canManageWorkers(workersAdmin), true);
  assert.equal(access.resolveAuthorizedHomePath(workersAdmin), "/manager/workers");
  assert.equal(permissions.canManageWorkers(operator), false);
});

test("checkbox compartilhado preserva semântica nativa e estado intermediário", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/ui/checkbox.tsx"),
    "utf8",
  );

  assert.match(source, /boolean \| "indeterminate"/);
  assert.match(source, /React\.forwardRef<HTMLInputElement, CheckboxProps>/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /aria-checked=\{isIndeterminate \? "mixed" : isChecked\}/);
  assert.match(source, /inputRef\.current\.indeterminate = isIndeterminate/);
  assert.match(source, /onCheckedChange\?\.\(nextChecked\)/);
  assert.match(source, /<Minus /);
  assert.match(source, /<Check /);
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
