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
const surfaces = ["live", "analytics", "reports"];
const families = ["counting", "occupancy", "demographics"];

test("grants granulares isolam cada superfície dentro de cada módulo", () => {
  for (const family of families) {
    for (const surface of surfaces) {
      const current = user([grant(`${family}_${surface}_view`)]);
      assert.equal(permissions.permissionDashboardSurface(current.permissions[0]), surface);
      for (const targetFamily of families) {
        for (const targetSurface of surfaces) {
          assert.equal(
            permissions.canViewModuleSurface(current, targetFamily, targetSurface),
            targetFamily === family && targetSurface === surface,
            `${family}/${surface} -> ${targetFamily}/${targetSurface}`,
          );
        }
      }
      assert.equal(permissions.canAccessOperationalDashboards(current), true);
    }
  }
});

test("aliases claros e ordem da ação preservam a superfície do catálogo", () => {
  for (const [slug, expected] of [
    ["counting_view_live", "live"],
    ["counting_read_realtime", "live"],
    ["contagem_ao_vivo_view", "live"],
    ["occupancy-real-time-read", "live"],
    ["counting_analysis_read", "analytics"],
    ["counting_read_analyses", "analytics"],
    ["contagem_análises_view", "analytics"],
    ["demographics_report_export", "reports"],
    ["demografico_relatórios_list", "reports"],
  ]) {
    assert.equal(permissions.permissionDashboardSurface(grant(slug)), expected, slug);
  }
  assert.equal(permissions.permissionDashboardSurface(grant("counting_reports", { action: "view" })), "reports");
  assert.equal(permissions.permissionDashboardSurface(grant("reports_view", { module: module("counting") })), "reports");
});

test("pacote genérico legado continua liberando as três telas, sem fabricar grants", () => {
  for (const slug of ["counting_view", "counting_read", "counting_manage"]) {
    const current = user([grant(slug)]);
    assert.equal(permissions.permissionDashboardSurface(current.permissions[0]), null);
    for (const surface of surfaces) {
      assert.equal(permissions.canViewModuleSurface(current, "counting", surface), true);
    }
  }
  const mixed = user([grant("counting_view"), grant("counting_reports_view")]);
  assert.equal(permissions.canViewModuleSurface(mixed, "counting", "live"), true);
});

test("superfície ambígua, malformada ou sem família não se torna pacote legado", () => {
  for (const slug of [
    "counting_live_reports_view",
    "counting_live_private_view",
    "counting_reports_manage",
    "counting_live",
    "reports_view",
  ]) {
    const current = user([grant(slug)]);
    assert.equal(permissions.permissionDashboardSurface(current.permissions[0]), null, slug);
    assert.equal(permissions.canAccessOperationalDashboards(current), false, slug);
  }
});

test("empresa, módulo desativado e capacidades explícitas continuam restritivos", () => {
  const scopedGrant = grant("counting_reports_view", {
    company_id: "company-current", module_id: "module-counting", module: module("counting"),
  });
  const assignment = { company_id: "company-current", enabled: true, module_id: "module-counting", module: module("counting") };
  const allowed = user([scopedGrant], { company_modules: [assignment] });
  assert.equal(permissions.canViewModuleSurface(allowed, "counting", "reports"), true);
  for (const denied of [
    user([scopedGrant], { company_modules: [] }),
    user([scopedGrant], { company_modules: [{ ...assignment, enabled: false }] }),
    user([scopedGrant], { company_modules: [{ ...assignment, company_id: "other-company" }] }),
    user([{ ...scopedGrant, company_id: "other-company" }]),
    user([{ ...scopedGrant, module: { ...module("counting"), active: false } }]),
    user([{ ...scopedGrant, module: module("occupancy") }]),
    user([{ ...scopedGrant, can_view: false, can_export: false }]),
  ]) {
    assert.equal(permissions.canAccessOperationalDashboards(denied), false);
  }
});

test("Master mantém bypass; Operador não ganha nenhuma mutação", () => {
  const master = user([], { role: "super-admin", company_modules: [] });
  for (const family of families) {
    for (const surface of surfaces) assert.equal(permissions.canViewModuleSurface(master, family, surface), true);
  }
  const operator = user([grant("counting_reports_view", { can_create: true })]);
  assert.equal(permissions.canViewModuleSurface(operator, "counting", "reports"), true);
  assert.equal(permissions.canManageWidgets(operator), false);
  assert.equal(permissions.canManageViews(operator), false);
  assert.equal(permissions.canManageWorkers(operator), false);
  assert.equal(permissions.canViewAudit(operator), false);
});

test("IDs reais contraditórios não emprestam assignment de outro módulo", () => {
  const contradictory = grant("occupancy_reports_view", {
    module_id: "module-counting", module: module("occupancy"),
  });
  const current = user([contradictory], {
    company_modules: [{ module_id: "module-counting", enabled: true }],
  });
  assert.equal(permissions.canViewModuleSurface(current, "occupancy", "reports"), false);
  assert.equal(permissions.canAccessOperationalDashboards(current), false);
  assert.equal(permissions.canAccessOperationalDashboards(user([contradictory])), false);
});

test("IDs sintéticos jwt-module continuam compatíveis com IDs reais hidratados", () => {
  const assignment = { module_id: "module-occupancy", enabled: true, module: module("occupancy") };
  for (const compatible of [
    grant("occupancy_reports_view", { module_id: "module-occupancy", module: module("occupancy") }),
    grant("occupancy_reports_view", { module_id: "module-occupancy", module: { ...module("occupancy"), id: "jwt-module:occupancy" } }),
    grant("occupancy_reports_view", { module_id: "jwt-module:occupancy", module: module("occupancy") }),
  ]) {
    assert.equal(permissions.canViewModuleSurface(user([compatible], { company_modules: [assignment] }), "occupancy", "reports"), true);
  }
});

test("famílias declaradas contraditórias não são tratadas como metadados ausentes", () => {
  for (const contradictory of [
    grant("counting_reports_view", { module: { id: "module-counting", slug: "counting", name: "Ocupação" } }),
    grant("occupancy_reports_view", { module: { id: "module-occupancy", slug: "counting occupancy", name: "Produto" } }),
    grant("counting_occupancy_reports_view", { module: module("occupancy") }),
  ]) {
    assert.equal(permissions.permissionModuleFamily(contradictory), null);
    assert.equal(permissions.permissionDashboardSurface(contradictory), null);
    assert.equal(permissions.canAccessOperationalDashboards(user([contradictory])), false);
  }
});

test("homes de Operador e Admin respeitam a primeira superfície autorizada", () => {
  const reports = user([grant("counting_reports_view")]);
  const analysisAdmin = user([
    grant("occupancy_analysis_read"), grant("workers_manage"),
  ], { role: "admin" });
  assert.equal(access.resolveAuthorizedHomePath(reports), "/dashboard/reports");
  assert.equal(access.resolveAuthorizedHomePath(analysisAdmin), "/manager/analytics");
  assert.equal(access.resolveAuthorizedHomePath(user([])), "/dashboard/live");
});

test("preload e seleção preferida não atravessam módulos de outra superfície", () => {
  const current = user([grant("counting_live_view"), grant("occupancy_reports_view")]);
  assert.equal(access.resolveAuthorizedDashboardModule(current, "/dashboard/reports", "counting"), "occupancy");
  assert.equal(access.resolveAuthorizedDashboardModule(current, "/dashboard/live", "occupancy"), "counting");
  assert.equal(access.resolveAuthorizedDashboardModule(current, "/dashboard/analytics", "counting"), undefined);
  assert.equal(access.resolveAuthorizedDashboardModule(current, "/dashboard/occupancy"), undefined);
  assert.equal(access.dashboardSurfaceForPathname("/manager/occupancy"), "live");
  assert.equal(access.dashboardSurfaceForPathname("/manager/workers"), undefined);
});

test("menus, URLs diretas, tabs e visões fullscreen usam a mesma superfície", () => {
  const shell = source("components/app/app-shell.tsx");
  for (const surface of surfaces) {
    assert.equal(shell.match(new RegExp(`canAccessOperationalDashboards\\(user, "${surface}"\\)`, "g"))?.length, 2);
  }
  const guard = source("components/app/auth-guard.tsx");
  assert.match(guard, /canViewModuleSurface\(user, requireModule, requireSurface\)/);
  assert.match(guard, /if \(loading \|\| !user \|\| denied\)/);
  assert.match(guard, /denied && authorizedHomePath === pathname/);
  assert.equal(source("components/app/authenticated-route-shell.tsx").match(/requireSurface=\{dashboardSurfaceForPathname\(pathname\)\}/g)?.length, 2);
  for (const [file, surface] of [
    ["live-dashboard-tabs", "live"], ["analysis-dashboard", "analytics"], ["reports-dashboard", "reports"],
  ]) assert.match(source(`components/app/${file}.tsx`), new RegExp(`surface="${surface}"`));
  assert.match(source("components/app/dashboard-module-tabs.tsx"), /dashboardModulesForUser\(user, surface\)/);
  for (const path of ["app/views/live/page.tsx", "app/views/dashboard/live/page.tsx"]) {
    assert.match(source(path), /<AuthGuard requireSurface="live">/);
  }
  assert.doesNotMatch(source("lib/app-route-preload.ts"), /activeDashboardModule\(\)/);
});

test("AI GET e POST verificam módulo e superfície antes de ler ou gerar insights", () => {
  const route = source("app/api/v1/ai/insights/route.ts");
  assert.match(route, /assertModuleAccess\(authentication, scope\.module, scope\.surface, request\.signal\)/);
  assert.match(route, /boundPayload\.snapshot\.source\.module,\s*boundPayload\.snapshot\.source\.surface,/);
  assert.match(route, /canViewModuleSurface\(\s*authorizedUser,\s*module,\s*surface === "analysis" \? "analytics" : surface,/);
});

test("API de visões recusa outra superfície antes de tocar o armazenamento", async () => {
  const fixture = dashboardViewRoute(user([grant("counting_reports_view")]));
  const denied = await fixture.route.GET(fixture.request(), { params: Promise.resolve({ menuKey: "live" }) });
  assert.equal(denied.status, 403);
  assert.equal(fixture.storeReads(), 0);
  const allowed = await fixture.route.GET(fixture.request(), { params: Promise.resolve({ menuKey: "reports" }) });
  assert.equal(allowed.status, 200);
  assert.equal(fixture.storeReads(), 1);
});

test("visão legada compartilhada exige o módulo certo sem inventar uma superfície", async () => {
  const fixture = dashboardViewRoute(user([grant("occupancy_reports_view")]));
  assert.equal((await fixture.route.GET(fixture.request(), { params: Promise.resolve({ menuKey: "occupancy" }) })).status, 200);
  assert.equal((await fixture.route.GET(fixture.request(), { params: Promise.resolve({ menuKey: "demographics" }) })).status, 403);
});

test("PUT de visões não amplia mutações e valida superfície antes de salvar", async () => {
  const fixture = dashboardViewRoute(user([grant("counting_reports_view")]));
  const response = await fixture.route.PUT(fixture.request(), { params: Promise.resolve({ menuKey: "reports" }) });
  assert.equal(response.status, 403);
  assert.equal(fixture.storeReads(), 0);
});

test("API de visões não aceita módulo revogado nem consulta fallback com lista JWT explícita", async () => {
  const fixture = dashboardViewRoute(user([grant("counting_reports_view")], { company_modules: [] }));
  const response = await fixture.route.GET(fixture.request(), { params: Promise.resolve({ menuKey: "reports" }) });
  assert.equal(response.status, 403);
  assert.deepEqual(fixture.paths(), ["/api/v1/auth/me"]);
});

test("fallback de módulos no servidor preserva revogação entre duplicatas", async () => {
  const assignment = { enabled: true, module_id: "module-counting", module: module("counting") };
  for (const companyModules of [
    [{ ...assignment, enabled: false }, assignment],
    [assignment, { ...assignment, module: { ...assignment.module, active: false } }],
    [{ ...assignment, company_id: "other-company" }],
  ]) {
    const fixture = dashboardViewRoute(user([grant("counting_reports_view")]), companyModules);
    const response = await fixture.route.GET(fixture.request(), { params: Promise.resolve({ menuKey: "reports" }) });
    assert.equal(response.status, 403);
    assert.equal(fixture.storeReads(), 0);
  }
});

function module(family) {
  return { id: `module-${family}`, name: family, slug: family, active: true };
}
function grant(slug, overrides = {}) {
  return { id: `permission-${slug}`, slug, ...overrides };
}
function user(grants, overrides = {}) {
  return { company_id: "company-current", email: "user@example.test", id: "user-current", name: "User", role: "operator", permissions: grants, ...overrides };
}
function source(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

function dashboardViewRoute(currentUser, companyModules) {
  let reads = 0;
  const paths = [];
  const mocks = {
    fs: { promises: { readFile: async () => { reads += 1; return "{}"; } } },
    "@/lib/backend-routing": { resolveBackendBaseUrl: () => "https://backend.example.test" },
    "@/lib/access-token-claims": { reconcileCurrentUserWithAccessToken: (value) => value },
    "@/lib/view-preferences": { normalizeCardPreferences: (_key, values) => values },
  };
  const route = loadTypeScriptModule("app/api/v1/dashboard-views/[menuKey]/route.ts", {
    cache: new Map(), mocks,
    fetch: async (url) => {
      const path = new URL(url).pathname;
      paths.push(path);
      let payload;
      if (path === "/api/v1/auth/me") payload = currentUser;
      else if (path === "/api/v1/company/modules") payload = companyModules ?? families.map((family) => ({ company_id: currentUser.company_id, enabled: true, module_id: `module-${family}`, module: module(family) }));
      else throw new Error(`Unexpected fetch: ${path}`);
      return { ok: true, json: async () => payload };
    },
  });
  return {
    route,
    request: () => ({ headers: new Headers({ authorization: "Bearer test-token" }), signal: new AbortController().signal }),
    paths: () => paths,
    storeReads: () => reads,
  };
}

function loadTypeScriptModule(relativePath, options = {}) {
  const filename = resolve(projectRoot, relativePath);
  const cache = options.cache ?? moduleCache;
  if (cache.has(filename)) return cache.get(filename).exports;
  const output = ts.transpileModule(source(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (options.mocks && specifier in options.mocks) return options.mocks[specifier];
    return specifier.startsWith("@/")
      ? loadTypeScriptModule(`${specifier.slice(2)}.ts`, options)
      : nodeRequire(specifier);
  };
  new Function("exports", "require", "module", "fetch", output)(loaded.exports, localRequire, loaded, options.fetch ?? globalThis.fetch);
  return loaded.exports;
}
