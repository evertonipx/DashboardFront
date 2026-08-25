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

const accessTokenClaims = loadTypeScriptModule("lib/access-token-claims.ts");
const authenticatedPermissionMetadata = loadTypeScriptModule(
  "lib/authenticated-permission-metadata.ts",
);
const api = loadTypeScriptModule("lib/api.ts");
const companyCache = loadTypeScriptModule("lib/company-cache.ts");
const companyTimeZone = loadTypeScriptModule("lib/company-time-zone.ts");
const companyAdminPermissionPolicy = loadTypeScriptModule(
  "lib/company-admin-permission-policy.ts",
);
const companyUserAdditiveAdmin = loadTypeScriptModule(
  "lib/company-user-additive-admin.ts",
);
const companyUserResource = loadTypeScriptModule(
  "lib/company-user-resource.ts",
);
const companyUserProfileUpdate = loadTypeScriptModule(
  "lib/company-user-profile-update.ts",
);
const occupancyAggregateValidation = loadTypeScriptModule(
  "lib/occupancy-aggregate-validation.ts",
);
const permissions = loadTypeScriptModule("lib/permissions.ts");
const resourceAutoRefresh = loadTypeScriptModule(
  "lib/resource-auto-refresh.ts",
);
const scenarioComparisonScope = loadTypeScriptModule(
  "lib/scenario-comparison-scope.ts",
);
const masterCompanyScope = loadTypeScriptModule(
  "lib/master-company-scope.ts",
);
const workerScope = loadTypeScriptModule("lib/worker-scope.ts");

test("papel de admin da empresa não dispara atualização do perfil", () => {
  const current = {
    name: "Usuário Empresa",
    email: "usuario@empresa.com",
    active: true,
  };

  assert.equal(
    companyUserProfileUpdate.buildCompanyUserProfileUpdate(current, {
      name: "  Usuário Empresa  ",
      email: "USUARIO@EMPRESA.COM",
      password: "",
      active: true,
    }),
    null,
  );

  assert.equal(
    companyUserProfileUpdate.buildCompanyUserProfileUpdate(
      current,
      {
        name: "Representação divergente recebida da listagem",
        email: "outro-formato@empresa.com",
        password: "",
        active: false,
      },
      { profileTouched: false },
    ),
    null,
    "uma alteração exclusiva de permissões não pode chamar PUT /users/{id}",
  );
});

test("toggle de admin permanece separado do PUT de perfil no painel master", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const adminToggle = source.slice(
    source.indexOf("function setCompanyAdminAccess"),
    source.indexOf("function setUserProfileField"),
  );
  const saveUser = source.slice(
    source.indexOf("async function saveUser"),
    source.indexOf("async function deleteCompanyUser"),
  );
  assert.doesNotMatch(adminToggle, /setUserProfileDirty/);
  assert.match(
    saveUser,
    /buildCompanyUserProfileUpdate\([\s\S]*?profileTouched: userProfileDirty/,
  );
  assert.match(source, /type="password"\s+autoComplete="new-password"/);
});

test("gestão cross-company separa descoberta, perfil e acessos", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const saveUser = source.slice(
    source.indexOf("async function saveUser"),
    source.indexOf("async function deleteCompanyUser"),
  );
  const deleteUser = source.slice(
    source.indexOf("async function deleteCompanyUser"),
    source.indexOf("async function saveMasterUser"),
  );

  assert.match(
    saveUser,
    /hasAccessMutation[\s\S]*?discoverCompanyUserResource<ManagedUser>[\s\S]*?mutateCompanyUserResource/,
  );
  assert.match(
    saveUser,
    /error\.status !== 404[\s\S]*?!hasAccessMutation[\s\S]*?profileUpdateWarning/,
  );
  assert.match(
    saveUser,
    /if \(hasAccessMutation\) \{[\s\S]*?await syncUserPermissions\(savedUserId, companyId\)/,
    "a sincronização só deve ocorrer quando algum acesso foi solicitado",
  );
  assert.match(
    deleteUser,
    /discoverCompanyUserResource\([\s\S]*?mutateCompanyUserResource\(route, "", \{ method: "DELETE" \}\)/,
    "a exclusão também deve usar uma única rota certificada por leitura",
  );
});

test("descoberta cross-company avança somente após 404 e muta uma única rota", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const request = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      companyId: new Headers(init.headers).get("X-Company-ID"),
      method: (init.method ?? "GET").toUpperCase(),
      path: String(url),
    };
    requests.push(request);

    if (request.method === "GET" && requests.length <= 2) {
      return jsonResponse({ error: "user not found" }, 404);
    }
    if (request.method === "GET") return jsonResponse([]);
    return jsonResponse({ ok: true });
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "super-admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-company-user-route",
      token_type: "Bearer",
    });

    const discovered = await companyUserResource.discoverCompanyUserResource(
      "company-selected",
      "user-selected",
      "/permissions",
    );
    assert.equal(discovered.route.variant, "company-path");

    await companyUserResource.mutateCompanyUserResource(
      discovered.route,
      "/permissions",
      { method: "POST", body: { slug: "views_manage" } },
    );

    assert.deepEqual(requests, [
      {
        body: undefined,
        companyId: "company-selected",
        method: "GET",
        path: "/api/v1/users/user-selected/permissions",
      },
      {
        body: undefined,
        companyId: "company-selected",
        method: "GET",
        path:
          "/api/v1/users/user-selected/permissions?company_id=company-selected",
      },
      {
        body: undefined,
        companyId: null,
        method: "GET",
        path:
          "/api/v1/companies/company-selected/users/user-selected/permissions",
      },
      {
        body: { slug: "views_manage" },
        companyId: null,
        method: "POST",
        path:
          "/api/v1/companies/company-selected/users/user-selected/permissions",
      },
    ]);
    assert.equal(
      requests.filter((request) => request.method !== "GET").length,
      1,
      "a descoberta não pode repetir uma mutação em outra variante",
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("404 da mutação não dispara uma segunda variante de rota", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const request = {
      method: (init.method ?? "GET").toUpperCase(),
      path: String(url),
    };
    requests.push(request);
    return request.method === "GET"
      ? jsonResponse({ id: "user-selected" })
      : jsonResponse({ error: "user not found" }, 404);
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "super-admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-company-user-mutation-404",
      token_type: "Bearer",
    });

    const discovered = await companyUserResource.discoverCompanyUserResource(
      "company-selected",
      "user-selected",
    );
    await assert.rejects(
      () =>
        companyUserResource.mutateCompanyUserResource(
          discovered.route,
          "",
          {
            method: "PUT",
            body: {
              active: true,
              email: "user@example.com",
              is_master: false,
              name: "User",
            },
          },
        ),
      (error) => error instanceof api.ApiError && error.status === 404,
    );

    assert.deepEqual(requests, [
      { method: "GET", path: "/api/v1/users/user-selected" },
      { method: "PUT", path: "/api/v1/users/user-selected" },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("403 de descoberta cross-company encerra sem fallback nem mutação", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    requests.push({
      method: (init.method ?? "GET").toUpperCase(),
      path: String(url),
    });
    return jsonResponse({ error: "forbidden" }, 403);
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "super-admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-company-user-forbidden",
      token_type: "Bearer",
    });

    await assert.rejects(
      () =>
        companyUserResource.discoverCompanyUserResource(
          "company-selected",
          "user-selected",
          "/permissions",
        ),
      (error) => error instanceof api.ApiError && error.status === 403,
    );
    assert.deepEqual(requests, [
      {
        method: "GET",
        path: "/api/v1/users/user-selected/permissions",
      },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("promoção aditiva certifica membership e cada UserPermissionResponse na rota documentada", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const request = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      companyId: new Headers(init.headers).get("X-Company-ID"),
      method: (init.method ?? "GET").toUpperCase(),
      path: String(url),
    };
    requests.push(request);

    if (request.method === "GET") {
      return jsonResponse([
        {
          company_id: "company-test",
          email: "teste@teste.com",
          id: "user-test",
          is_master: false,
        },
      ]);
    }
    const slug = request.body.slug;
    return jsonResponse(
      {
        company_id: "company-test",
        id: `assignment-${slug}`,
        permission_id:
          slug === "counting_view" ? "permission-1" : "permission-2",
        slug,
        user_id: "user-test",
      },
      201,
    );
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "super-admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-additive-admin-success",
      token_type: "Bearer",
    });

    const result =
      await companyUserAdditiveAdmin.promoteCompanyUserToAdminAdditively({
        companyId: "company-test",
        expectedEmail: "teste@teste.com",
        grants: [
          { permissionId: "permission-1", slug: "counting_view" },
          { permissionId: "permission-2", slug: "counting_manage" },
        ],
        userId: "user-test",
      });

    assert.deepEqual(
      result.map((permission) => permission.slug),
      ["counting_view", "counting_manage"],
    );
    assert.deepEqual(requests, [
      {
        body: undefined,
        companyId: null,
        method: "GET",
        path: "/api/v1/companies/company-test/users",
      },
      {
        body: { slug: "counting_view" },
        companyId: "company-test",
        method: "POST",
        path: "/api/v1/users/user-test/permissions",
      },
      {
        body: { slug: "counting_manage" },
        companyId: "company-test",
        method: "POST",
        path: "/api/v1/users/user-test/permissions",
      },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("promoção aditiva rejeita 409 não certificado e reverte somente IDs criados na tentativa", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const request = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      companyId: new Headers(init.headers).get("X-Company-ID"),
      method: (init.method ?? "GET").toUpperCase(),
      path: String(url),
    };
    requests.push(request);

    if (request.method === "GET") {
      return jsonResponse([
        {
          company_id: "company-test",
          email: "teste@teste.com",
          id: "user-test",
          is_master: false,
        },
      ]);
    }
    if (request.method === "DELETE") return jsonResponse(undefined, 204);
    if (request.body.slug === "counting_view") {
      return jsonResponse(
        {
          company_id: "company-test",
          id: "assignment-1",
          permission_id: "permission-1",
          slug: "counting_view",
          user_id: "user-test",
        },
        201,
      );
    }
    return jsonResponse({ error: "permission already exists" }, 409);
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "super-admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-additive-admin-rollback",
      token_type: "Bearer",
    });

    await assert.rejects(
      () =>
        companyUserAdditiveAdmin.promoteCompanyUserToAdminAdditively({
          companyId: "company-test",
          expectedEmail: "teste@teste.com",
          grants: [
            { permissionId: "permission-1", slug: "counting_view" },
            { permissionId: "permission-2", slug: "counting_manage" },
          ],
          userId: "user-test",
        }),
      /409 sem retornar uma permissão certificada[\s\S]*foram revertidas/,
    );
    assert.deepEqual(
      requests.map(({ body, companyId, method, path }) => ({
        body,
        companyId,
        method,
        path,
      })),
      [
        {
          body: undefined,
          companyId: null,
          method: "GET",
          path: "/api/v1/companies/company-test/users",
        },
        {
          body: { slug: "counting_view" },
          companyId: "company-test",
          method: "POST",
          path: "/api/v1/users/user-test/permissions",
        },
        {
          body: { slug: "counting_manage" },
          companyId: "company-test",
          method: "POST",
          path: "/api/v1/users/user-test/permissions",
        },
        {
          body: undefined,
          companyId: "company-test",
          method: "DELETE",
          path: "/api/v1/users/user-test/permissions/permission-1",
        },
      ],
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("promoção aditiva reverte pelo permission_id certificado quando o corpo 201 diverge", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const request = {
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      companyId: new Headers(init.headers).get("X-Company-ID"),
      method: (init.method ?? "GET").toUpperCase(),
      path: String(url),
    };
    requests.push(request);

    if (request.method === "GET") {
      return jsonResponse([
        {
          company_id: "company-test",
          email: "teste@teste.com",
          id: "user-test",
          is_master: false,
        },
      ]);
    }
    if (request.method === "DELETE") return jsonResponse(undefined, 204);
    return jsonResponse(
      {
        company_id: "company-test",
        id: "assignment-wrong",
        permission_id: "permission-from-divergent-response",
        slug: "counting_view",
        user_id: "user-test",
      },
      201,
    );
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "super-admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-additive-admin-divergent-response",
      token_type: "Bearer",
    });

    await assert.rejects(
      () =>
        companyUserAdditiveAdmin.promoteCompanyUserToAdminAdditively({
          companyId: "company-test",
          expectedEmail: "teste@teste.com",
          grants: [
            { permissionId: "permission-1", slug: "counting_view" },
          ],
          userId: "user-test",
        }),
      /permission_id divergente[\s\S]*foram revertidas/,
    );
    assert.deepEqual(requests.at(-1), {
      body: undefined,
      companyId: "company-test",
      method: "DELETE",
      path: "/api/v1/users/user-test/permissions/permission-1",
    });
    assert.equal(
      requests.some((request) =>
        request.path.endsWith("/permission-from-divergent-response"),
      ),
      false,
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("promoção aditiva para antes do POST quando id/company do membership divergem", async () => {
  assert.throws(
    () =>
      companyUserAdditiveAdmin.certifyCompanyUserMembership(
        [
          {
            company_id: "company-home",
            email: "teste@teste.com",
            id: "user-test",
          },
        ],
        {
          companyId: "company-test",
          expectedEmail: "teste@teste.com",
          userId: "user-test",
        },
      ),
    /company_id exato/,
  );
  assert.throws(
    () =>
      companyUserAdditiveAdmin.certifyAdditivePermissionResponse(
        {
          company_id: "company-test",
          permission_id: "permission-1",
          slug: "counting_view",
          user_id: "foreign-user",
        },
        {
          companyId: "company-test",
          permissionId: "permission-1",
          slug: "counting_view",
          userId: "user-test",
        },
      ),
    /user_id divergente/,
  );
});

test("UI do fallback não oferece PUT, granularidade nem revogação", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const fallbackSave = source.slice(
    source.indexOf("if (additiveAdminPromotionMode) {", source.indexOf("async function saveUser")),
    source.indexOf("if (userForm.isMaster)", source.indexOf("async function saveUser")),
  );
  const fallbackNotice = source.slice(
    source.indexOf(") : additiveAdminPromotionMode ? ("),
    source.indexOf(") : editingUser &&", source.indexOf(") : additiveAdminPromotionMode ? (")),
  );

  assert.match(fallbackSave, /promoteCompanyUserToAdminAdditively/);
  assert.doesNotMatch(fallbackSave, /PUT|revokeUserPermission|syncUserPermissions/);
  assert.match(fallbackSave, /!companyAdminPromotionRequested/);
  assert.match(fallbackSave, /touchedUserPermissionSlugs\.size > 0/);
  assert.match(fallbackNotice, /somente o controle/);
  assert.match(fallbackNotice, /Administrador da empresa/);
  assert.match(fallbackNotice, /acessos granulares/);
  assert.match(
    source,
    /if \(error instanceof ApiError && error\.status === 404\) \{[\s\S]*?readCertifiedCompanyUserMembership/,
    "o modo aditivo nunca pode contornar 401, 403, falha de rede ou 5xx",
  );
});

test("promoção de admin usa somente permissões explícitas e seguras", () => {
  const widgetDefinition = permissions.OPERATIONAL_PERMISSIONS.find(
    (permission) => permission.slug === "dashboard_widgets_manage",
  );
  const locationDefinition = permissions.OPERATIONAL_PERMISSIONS.find(
    (permission) => permission.slug === "locations_manage",
  );
  const scenarioDefinition = permissions.OPERATIONAL_PERMISSIONS.find(
    (permission) => permission.slug === "scenarios_manage",
  );
  const cameraDefinition = permissions.OPERATIONAL_PERMISSIONS.find(
    (permission) => permission.slug === "cameras_manage",
  );

  assert.ok(widgetDefinition);
  assert.ok(locationDefinition);
  assert.ok(scenarioDefinition);
  assert.ok(cameraDefinition);
  assert.equal(
    permissions.permissionMatchesExplicitGrant(
      { slug: "dashboard_layout_manage" },
      widgetDefinition,
    ),
    true,
  );
  assert.equal(
    permissions.permissionMatchesExplicitGrant(
      { slug: "counting_create_scenario" },
      widgetDefinition,
    ),
    false,
    "acesso a cenário não pode conceder configuração de widgets",
  );
  assert.equal(
    permissions.permissionMatchesExplicitGrant(
      { slug: "counting_create_camera" },
      locationDefinition,
    ),
    false,
    "acesso a câmera não pode conceder edição de locations",
  );
  assert.equal(
    permissions.permissionMatchesExplicitGrant(
      { slug: "counting_create_scenario" },
      scenarioDefinition,
    ),
    true,
  );
  assert.equal(
    permissions.permissionMatchesExplicitGrant(
      { slug: "counting_create_camera" },
      cameraDefinition,
    ),
    true,
  );
  assert.equal(
    permissions.permissionMatchesExplicitGrant(
      { slug: "dashboard_experimental_configure" },
      widgetDefinition,
    ),
    false,
    "uma correspondência apenas textual não pode ser usada em alteração granular",
  );
});

test("rotas administrativas exigem a concessão do próprio recurso", () => {
  const guardedPages = {
    cameras: "app/manager/cameras/page.tsx",
    locations: "app/manager/locations/page.tsx",
    occupancy: "app/manager/occupancy/page.tsx",
    scenarios: "app/manager/scenarios/page.tsx",
    views: "app/manager/views/page.tsx",
    workers: "app/manager/workers/page.tsx",
  };

  for (const [resource, page] of Object.entries(guardedPages)) {
    const source = readFileSync(resolve(projectRoot, page), "utf8");
    assert.match(
      source,
      new RegExp(`requireManager requireResource="${resource}"`),
      `${page} não pode confiar apenas no acesso genérico ao Manager`,
    );
  }

  const guardSource = readFileSync(
    resolve(projectRoot, "components/app/auth-guard.tsx"),
    "utf8",
  );
  for (const capability of [
    "canManageCameras",
    "canManageLocations",
    "canManageOccupancy",
    "canManageScenarios",
    "canManageViews",
    "canManageWorkers",
  ]) {
    assert.match(guardSource, new RegExp(`${capability}\\(user\\)`));
  }
});

test("perfil admin certifica todo o catálogo real dos módulos operacionais habilitados", () => {
  const enabledModules = new Set(["counting-module"]);
  const options = [
    {
      module_id: "counting-module",
      slug: "counting_view",
      grants: [
        {
          id: "counting-view-permission",
          module_id: "counting-module",
          slug: "counting_view",
        },
      ],
    },
    {
      module_id: "counting-module",
      slug: "counting_manage",
      grants: [
        {
          id: "counting-manage-permission",
          module_id: "counting-module",
          slug: "counting_manage",
        },
      ],
    },
    {
      module_id: "occupancy-module",
      slug: "occupancy_view",
      grants: [
        {
          id: "occupancy-view-permission",
          module_id: "occupancy-module",
          slug: "occupancy_view",
        },
      ],
    },
  ];

  assert.deepEqual(
    companyAdminPermissionPolicy.missingCompanyAdminPermissionSlugs(
      options,
      enabledModules,
    ),
    [],
  );
  assert.equal(
    companyAdminPermissionPolicy.isCertifiedCompanyAdminState(
      {
        counting_view: true,
        counting_manage: true,
        occupancy_view: false,
      },
      options,
      enabledModules,
    ),
    true,
  );
  assert.equal(
    companyAdminPermissionPolicy.isCertifiedCompanyAdminState(
      {
        counting_view: true,
        counting_manage: false,
        occupancy_view: true,
      },
      options,
      enabledModules,
    ),
    false,
  );
  assert.deepEqual(
    companyAdminPermissionPolicy.missingCompanyAdminPermissionSlugs(
      options,
      new Set(),
    ),
    [],
    "um módulo desabilitado não exige nem libera permissões",
  );

  const unavailableAtomicCatalogOptions = options.map((option) =>
    option.slug === "counting_view"
      ? {
          ...option,
          grants: [],
          unavailable: true,
        }
      : option,
  );
  assert.deepEqual(
    companyAdminPermissionPolicy.missingCompanyAdminPermissionSlugs(
      unavailableAtomicCatalogOptions,
      enabledModules,
    ),
    ["counting_view"],
    "uma permissão publicada do módulo habilitado não pode ser certificada sem grant exato",
  );
  assert.equal(
    Object.hasOwn(companyAdminPermissionPolicy, "COMPANY_ADMIN_ESSENTIAL_PERMISSION_SLUGS"),
    false,
    "o contrato não pode inventar slugs essenciais ausentes do catálogo Swagger",
  );
  assert.deepEqual(
    companyAdminPermissionPolicy.enabledCompanyAdminOperationalSlugs(
      [
        {
          module_id: "counting-module",
          slug: "counting_view",
          grants: [
            {
              id: "cross-module-permission",
              module_id: "occupancy-module",
              slug: "counting_view",
            },
          ],
        },
      ],
      new Set(["counting-module", "occupancy-module"]),
    ),
    [],
    "module_id divergente não pode certificar nem conceder outro módulo",
  );
});

test("sincronização de admin é aditiva e alterações granulares não tocam o restante", () => {
  const enabledModuleIds = new Set(["counting-module"]);
  const option = {
    slug: "views_manage",
    grants: [
      {
        id: "views-permission",
        module_id: "counting-module",
        slug: "views_manage",
      },
    ],
  };
  const mutation = (overrides = {}) =>
    companyAdminPermissionPolicy.resolvePermissionMutation({
      baselineCertified: true,
      companyAdminPromotion: false,
      desired: false,
      enabledModuleIds,
      option,
      permissionTouched: false,
      ...overrides,
    });

  assert.equal(mutation(), "none", "opção não tocada deve ser preservada");
  assert.equal(
    mutation({ desired: true }),
    "none",
    "estado já carregado não deve gerar concessão redundante",
  );
  assert.equal(
    mutation({ desired: true, permissionTouched: true }),
    "grant",
  );
  assert.equal(mutation({ permissionTouched: true }), "revoke");
  assert.equal(
    mutation({ baselineCertified: false, permissionTouched: true }),
    "blocked-revoke",
  );
  assert.equal(
    mutation({ companyAdminPromotion: true, permissionTouched: true }),
    "none",
    "promoção nunca revoga",
  );
  assert.equal(
    mutation({ companyAdminPromotion: true, desired: true }),
    "grant",
  );
  assert.deepEqual(
    companyAdminPermissionPolicy.enabledCompanyAdminOperationalSlugs(
      [
        {
          slug: "views_manage",
          grants: [
            {
              id: "views-permission",
              module_id: "counting-module",
              slug: "views_manage",
            },
          ],
        },
        {
          slug: "dashboard_widgets_manage",
          grants: [
            {
              id: "known-atomic-permission",
              module_id: "counting-module",
              slug: "counting_create_scenario",
            },
          ],
        },
        {
          slug: "workers_manage",
          grants: [
            {
              id: "foreign-permission",
              module_id: "foreign-module",
              slug: "must_not_be_granted",
            },
          ],
        },
        {
          slug: "master_access",
          grants: [
            {
              id: "sensitive-permission",
              module_id: "counting-module",
              slug: "tenant_master_delete",
            },
          ],
          unavailable: true,
        },
      ],
      enabledModuleIds,
    ),
    ["views_manage", "counting_create_scenario"],
    "admin recebe somente grants operacionais explícitos, nunca o catálogo bruto",
  );

  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const syncSource = source.slice(
    source.indexOf("async function syncUserPermissions"),
    source.indexOf("async function toggleCompanyModule"),
  );
  assert.match(syncSource, /resolvePermissionMutation/);
  assert.match(syncSource, /grantCompanyAdminOperationalPermissions/);
  assert.doesNotMatch(
    syncSource,
    /grantCompanyAdminOperationalPermissions\([\s\S]*?permissionCatalog/,
    "promoção não pode encaminhar o catálogo bruto de permissões",
  );
  assert.doesNotMatch(
    syncSource,
    /option\.slug !== "dashboard_widgets_manage"|option\.slug !== "locations_manage"/,
  );
});

test("grade do Master usa cada PermissionResponse operacional sem hardcode de slug", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const resolverStart = source.indexOf(
    "function resolveOperationalPermissionOptions",
  );
  const resolverSource = source.slice(resolverStart);
  const groupingStart = source.indexOf("function groupPermissionCatalog");
  const groupingEnd = source.indexOf(
    "function companyAdminCertificationErrorMessage",
    groupingStart,
  );
  const groupingSource = source.slice(groupingStart, groupingEnd);

  assert.match(resolverSource, /catalog\.flatMap/);
  assert.match(resolverSource, /permission\.action/);
  assert.match(resolverSource, /module_id: moduleId/);
  assert.match(resolverSource, /slug,/);
  assert.match(resolverSource, /algorithmModuleFamily\(permissionModule\)/);
  assert.doesNotMatch(resolverSource, /OPERATIONAL_PERMISSIONS/);
  assert.doesNotMatch(resolverSource, /permissionMatchesExplicitGrant/);
  assert.match(groupingSource, /groups\.get\(permission\.module_id\)/);
  assert.match(source, /Slug: <code>\{permission\.slug\}<\/code>/);
  assert.match(source, /Módulo: <code>\{permission\.module_id\}<\/code>/);
  assert.match(
    source,
    /unavailable: option\.unavailable \|\| !hasEnabledGrant/,
    "permissões de módulo não habilitado devem continuar visíveis, porém indisponíveis",
  );
});

test("alteração real de usuário gera o PUT completo exigido pela API", () => {
  assert.deepEqual(
    companyUserProfileUpdate.buildCompanyUserProfileUpdate(
      {
        name: "Usuário Empresa",
        email: "usuario@empresa.com",
        active: true,
      },
      {
        name: "  Usuário Atualizado ",
        email: "novo@empresa.com ",
        password: "nova-senha-segura",
        active: false,
      },
    ),
    {
      name: "Usuário Atualizado",
      email: "novo@empresa.com",
      is_master: false,
      active: false,
      password: "nova-senha-segura",
    },
  );
});

test("resposta de usuário não pode redirecionar permissões para outra identidade", () => {
  assert.equal(
    companyUserProfileUpdate.certifyCompanyUserMutationIdentity(
      {
        id: "user-company-a",
        company_id: "company-a",
      },
      {
        companyId: "company-a",
        userId: "user-company-a",
      },
    ),
    "user-company-a",
  );
  assert.equal(
    companyUserProfileUpdate.certifyCompanyUserMutationIdentity(
      { id: "user-company-a" },
      { companyId: "company-a" },
    ),
    "user-company-a",
    "company_id omitido é tolerado somente após a requisição já escopada",
  );
  assert.throws(
    () =>
      companyUserProfileUpdate.certifyCompanyUserMutationIdentity(
        {
          id: "user-company-b",
          company_id: "company-b",
        },
        { companyId: "company-a" },
      ),
    /fora da empresa selecionada "company-a"/,
  );
  assert.throws(
    () =>
      companyUserProfileUpdate.certifyCompanyUserMutationIdentity(
        {
          id: "another-user",
          company_id: "company-a",
        },
        {
          companyId: "company-a",
          userId: "expected-user",
        },
      ),
    /ao editar "expected-user"/,
  );
});

test("sessão substituída remove expiração antiga e rejeita login malformado", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = { dispatchEvent() {}, localStorage: storage };

  try {
    api.setStoredSession({
      access_token: "access-valid",
      refresh_token: "refresh-valid",
      token_type: "Bearer",
      expires_in: 900,
    });
    assert.notEqual(storage.getItem("expires_at"), null);

    const signedExpiration = Math.floor(Date.now() / 1000) + 120;
    api.setStoredSession({
      access_token: accessToken({ exp: signedExpiration, sub: "session-user" }),
      refresh_token: "refresh-signed-expiration",
      token_type: "Bearer",
      expires_in: 900,
    });
    assert.equal(
      Number(storage.getItem("expires_at")),
      signedExpiration * 1000,
      "expires_in não pode prolongar a sessão além do exp assinado",
    );

    api.setStoredSession({
      access_token: "access-without-expiration",
      refresh_token: "refresh-without-expiration",
      token_type: "Bearer",
    });
    assert.equal(storage.getItem("expires_in"), null);
    assert.equal(storage.getItem("expires_at"), null);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ access_token: "" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    await assert.rejects(
      api.loginRequest("teste@teste.com", "senha"),
      /access_token inválido|sessão inválida/,
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("auth me mantém o snapshot do JWT realmente enviado na requisição", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  let releaseResponse;
  let markRequestStarted;
  const responseGate = new Promise((resolveResponse) => {
    releaseResponse = resolveResponse;
  });
  const requestStarted = new Promise((resolveStarted) => {
    markRequestStarted = resolveStarted;
  });
  let authorization = "";
  globalThis.window = { dispatchEvent() {}, localStorage: storage };
  globalThis.fetch = async (_url, init = {}) => {
    authorization = new Headers(init.headers).get("Authorization") ?? "";
    markRequestStarted();
    await responseGate;
    return jsonResponse({
      company_id: "company-a",
      email: "user@example.com",
      id: "user-a",
      is_master: false,
      name: "User A",
    });
  };

  try {
    api.setStoredSession({
      access_token: "access-token-a",
      refresh_token: "refresh-token-a",
      token_type: "Bearer",
    });
    const pending = api.currentUserRequestWithAccessToken();
    await requestStarted;
    api.setStoredSession({
      access_token: "access-token-b",
      refresh_token: "refresh-token-b",
      token_type: "Bearer",
    });
    releaseResponse();

    const result = await pending;
    assert.equal(authorization, "Bearer access-token-a");
    assert.equal(result.accessToken, "access-token-a");
    assert.equal(storage.getItem("access_token"), "access-token-b");
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("timezone efetivo acompanha a empresa selecionada e usa fallback explícito", () => {
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    companyCache.writeCompanyCache([
      {
        id: "company-cache",
        name: "Empresa em cache",
        timezone: "Europe/Lisbon",
      },
    ]);
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-selected",
      name: "Empresa selecionada",
      timezone: "Asia/Tokyo",
    });

    assert.deepEqual(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution({
        email: "master@example.com",
        id: "master",
        is_master: true,
        name: "Master",
      }),
      {
        fallback: false,
        source: "selected-company",
        timeZone: "Asia/Tokyo",
      },
    );

    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-cache",
      name: "Empresa em cache",
    });
    assert.equal(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution({
        email: "master@example.com",
        id: "master",
        is_master: true,
        name: "Master",
      }).source,
      "company-cache",
    );

    const regularResolution =
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution({
        company_id: "company-regular",
        company: {
          id: "company-regular",
          name: "Empresa regular",
          timezone: "America/Manaus",
        },
        email: "user@example.com",
        id: "user",
        is_master: false,
        name: "User",
      });
    assert.deepEqual(regularResolution, {
      fallback: false,
      source: "current-user-company",
      timeZone: "America/Manaus",
    });

    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-invalid",
      name: "Empresa sem fuso válido",
      timezone: "Mars/Olympus",
    });
    const fallback =
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution({
        email: "master@example.com",
        id: "master",
        is_master: true,
        name: "Master",
      });
    assert.equal(fallback.timeZone, "America/Sao_Paulo");
    assert.equal(fallback.fallback, true);
    assert.match(fallback.warning, /inválido.*America\/Sao_Paulo/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("cache de empresa preserva timezone quando atualização parcial o omite", () => {
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    companyCache.writeCompanyCache([
      {
        id: "company-a",
        name: "Empresa A",
        timezone: "America/Fortaleza",
      },
    ]);
    companyCache.writeCompanyCache([
      { id: "company-a", name: "Empresa A atualizada" },
    ]);

    assert.deepEqual(companyCache.readCachedCompany("company-a"), {
      id: "company-a",
      name: "Empresa A atualizada",
      timezone: "America/Fortaleza",
      trade_name: null,
    });
    companyCache.writeCompanyCache([
      {
        company_timezone: "America/Recife",
        id: "company-alias",
        name: "Empresa com alias",
      },
    ]);
    assert.equal(
      companyCache.readCachedCompany("company-alias")?.timezone,
      "America/Recife",
      "o cache deve normalizar o alias realmente retornado pela API",
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("superadmin usa timezone do JWT apenas quando o tenant do claim é o selecionado", () => {
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);

  try {
    const master = accessTokenClaims.reconcileCurrentUserWithAccessToken(
      {
        email: "master@example.com",
        id: "master-jwt",
        is_master: true,
        name: "Master",
      },
      accessToken({
        company_id: "company-jwt",
        company_timezone: "America/Manaus",
        exp: now / 1000 + 900,
        role: "super-admin",
        sub: "master-jwt",
      }),
      now,
    );
    assert.ok(master);
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-jwt",
      name: "Empresa JWT",
    });
    assert.deepEqual(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(master),
      {
        fallback: false,
        source: "current-user-company",
        timeZone: "America/Manaus",
      },
    );

    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-other",
      name: "Outra empresa",
    });
    assert.equal(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(master).fallback,
      true,
      "o fuso do JWT não pode atravessar para outro tenant selecionado",
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("override do video wall exige empresa ativa e timezone do mesmo escopo", () => {
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  const master = {
    email: "master@example.com",
    id: "master",
    is_master: true,
    name: "Master",
  };

  try {
    companyCache.writeCompanyCache([
      {
        id: "company-a",
        name: "Empresa A",
        timezone: "America/Manaus",
      },
      {
        id: "company-b",
        name: "Empresa B",
        timezone: "Asia/Tokyo",
      },
    ]);
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-a",
      name: "Empresa A",
    });

    assert.deepEqual(
      masterCompanyScope.certifyCompanyScopeTimeZoneOverride(
        master,
        "company-a",
      ),
      {
        companyScopeId: "company-a",
        timeZone: "America/Manaus",
      },
    );
    assert.deepEqual(
      masterCompanyScope.certifyCompanyScopeTimeZoneOverride(
        master,
        "company-b",
      ),
      {
        companyScopeId: "company-b",
        error: "Empresa do video wall não corresponde à empresa ativa.",
      },
      "o cache de outra empresa não autoriza um override divergente",
    );

    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-without-timezone",
      name: "Empresa sem fuso",
    });
    assert.deepEqual(
      masterCompanyScope.certifyCompanyScopeTimeZoneOverride(
        master,
        "company-without-timezone",
      ),
      {
        companyScopeId: "company-without-timezone",
        error: "Fuso da empresa do video wall não certificado.",
      },
      "o caminho explícito não pode usar o timezone fallback",
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("comparativo certifica empresa e fuso da fonte horária", () => {
  const base = {
    companyScopeId: "company-a",
    companyTimeZone: "America/Sao_Paulo",
    hourlySource: {
      companyScopeId: "company-a",
      companyTimeZone: "America/Sao_Paulo",
    },
    scenarios: [{ company_id: "company-a", id: "scenario-a" }],
  };

  assert.deepEqual(
    scenarioComparisonScope.requireScenarioComparisonScope(base),
    {
      companyScopeId: "company-a",
      companyTimeZone: "America/Sao_Paulo",
    },
  );
  assert.throws(
    () =>
      scenarioComparisonScope.requireScenarioComparisonScope({
        ...base,
        hourlySource: {
          ...base.hourlySource,
          companyScopeId: "company-b",
        },
      }),
    /fonte horária pertence a outra empresa/,
  );
  assert.throws(
    () =>
      scenarioComparisonScope.requireScenarioComparisonScope({
        ...base,
        hourlySource: {
          ...base.hourlySource,
          companyTimeZone: "UTC",
        },
      }),
    /fonte horária usa outro fuso/,
  );
  assert.throws(
    () =>
      scenarioComparisonScope.requireScenarioComparisonScope({
        ...base,
        scenarios: [{ company_id: "company-b", id: "scenario-b" }],
      }),
    /cenário "scenario-b" pertence a outra empresa/,
  );
});

test("video wall e comparativo propagam o escopo explícito em todas as consultas", () => {
  const liveSource = readFileSync(
    resolve(projectRoot, "components/app/realtime-dashboard.tsx"),
    "utf8",
  );
  const comparisonSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-comparison-card.tsx"),
    "utf8",
  );
  const reportSource = readFileSync(
    resolve(projectRoot, "components/app/scenario-reports-dashboard.tsx"),
    "utf8",
  );

  assert.match(liveSource, /certifyCompanyScopeTimeZoneOverride\(/);
  assert.match(
    liveSource,
    /companyScopeCertificationError[\s\S]*?setChartData\(\{\}\)[\s\S]*?return;/,
    "um override não certificado deve parar antes da consulta",
  );
  for (const path of ["scenarios", "cameras", "locations"]) {
    assert.match(
      liveSource,
      new RegExp(
        `apiFetch<unknown>\\("/${path}", \\{ companyScopeId \\}\\)`,
      ),
      `/${path} deve receber a empresa explícita`,
    );
  }
  assert.match(
    liveSource,
    /aggregatePath\(definition\)[\s\S]*?\{ companyScopeId, signal: controller\.signal \}/,
  );
  assert.match(
    liveSource,
    /`\/locations\/\$\{location\.id\}\/sub-locations`, \{[\s\S]*?companyScopeId:/,
  );
  assert.match(
    liveSource,
    /apiFetch<unknown>\("\/workers", \{ companyScopeId \}\)/,
  );
  assert.match(
    comparisonSource,
    /fetchScenarioComparisonRows\([\s\S]*?companyScopeId: string/,
  );
  assert.match(
    comparisonSource,
    /`\/analytics\/aggregate\?\$\{params\.toString\(\)\}`,[\s\S]*?\{ companyScopeId \}/,
  );
  assert.match(
    reportSource,
    /companyScopeId,[\s\S]*?companyTimeZone,[\s\S]*?from: canonicalDefinition\.from/,
    "a fonte horária reutilizada pelo comparativo deve carregar sua identidade",
  );
  for (const path of ["scenarios", "cameras", "locations"]) {
    assert.match(
      reportSource,
      new RegExp(
        `apiFetch<unknown>\\("/${path}", \\{ companyScopeId \\}\\)`,
      ),
      `o caller de relatório deve escopar /${path}`,
    );
  }
  assert.match(
    reportSource,
    /fetchHourlyAggregateRanges\(\{[\s\S]*?companyScopeId:/,
    "o cache horário de relatórios deve receber a empresa explícita",
  );
  assert.match(
    reportSource,
    /aggregatePath\(definition\),\s*\{ companyScopeId, signal: controller\.signal \}/g,
    "as demais granularidades de relatório devem manter escopo e cancelamento explícitos",
  );
});

test("limites civis da empresa independem do timezone do navegador", () => {
  const instant = new Date("2026-08-07T15:37:42.000Z");
  const parts = companyTimeZone.companyZonedDateParts(
    instant,
    "America/Sao_Paulo",
  );
  assert.deepEqual(parts, {
    day: 7,
    hour: 12,
    minute: 37,
    month: 8,
    second: 42,
    year: 2026,
  });
  assert.equal(
    companyTimeZone
      .startOfCompanyTimeZoneHour(instant, "America/Sao_Paulo")
      .toISOString(),
    "2026-08-07T15:00:00.000Z",
  );
  assert.equal(
    companyTimeZone
      .endOfCompanyTimeZoneHour(instant, "America/Sao_Paulo")
      .toISOString(),
    "2026-08-07T16:00:00.000Z",
  );
  assert.equal(
    companyTimeZone.companyTimeZoneOffsetLabel(
      instant,
      "America/Sao_Paulo",
    ),
    "UTC-03",
  );
  assert.equal(
    companyTimeZone
      .startOfCompanyTimeZoneDay(
        new Date("2026-08-07T02:30:00.000Z"),
        "America/Sao_Paulo",
      )
      .toISOString(),
    "2026-08-06T03:00:00.000Z",
  );

  const tokyoYear = companyTimeZone.companyCalendarDate(
    new Date("2026-12-31T16:00:00.000Z"),
    "Asia/Tokyo",
    "year",
  );
  assert.deepEqual(
    [tokyoYear.getFullYear(), tokyoYear.getMonth(), tokyoYear.getDate()],
    [2027, 0, 1],
  );
});

test("consulta civil bloqueia divergência entre navegador e empresa", () => {
  const runtimeTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.equal(
    companyTimeZone.requireRuntimeCompanyTimeZone(runtimeTimeZone),
    runtimeTimeZone,
  );
  const differentTimeZone = runtimeTimeZone === "UTC"
    ? "America/Sao_Paulo"
    : "UTC";
  assert.throws(
    () => companyTimeZone.requireRuntimeCompanyTimeZone(differentTimeZone),
    /consulta civil foi bloqueada.*não deslocar horas, dias, meses ou anos/,
  );
});

test("hora repetida por DST mantém os dois buckets absolutos da empresa", () => {
  const first = new Date("2026-11-01T05:30:00.000Z");
  const second = new Date("2026-11-01T06:30:00.000Z");
  const firstStart = companyTimeZone.startOfCompanyTimeZoneHour(
    first,
    "America/New_York",
  );
  const secondStart = companyTimeZone.startOfCompanyTimeZoneHour(
    second,
    "America/New_York",
  );

  assert.equal(firstStart.toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(secondStart.toISOString(), "2026-11-01T06:00:00.000Z");
  assert.notEqual(firstStart.getTime(), secondStart.getTime());
});

test("agregado de ocupação é validado contra o timezone efetivo da empresa", () => {
  const resolution = companyTimeZone.resolveCompanyTimeZone([
    { source: "selected-company", value: "America/Sao_Paulo" },
  ]);
  const row = {
    bucket: "2026-08-07T12:00:00-03:00",
    scenario_total_avg: 3,
    scenario_total_max: 7,
    scenario_total_min: 0,
  };

  assert.equal(
    occupancyAggregateValidation.requireOccupancyAggregateRows(
      {
        data: [row],
        granularity: "hour",
        scenario_id: "scenario-a",
        timezone: "America/Sao_Paulo",
      },
      "hour",
      "scenario-a",
      resolution.timeZone,
    )[0],
    row,
  );
  assert.throws(
    () =>
      occupancyAggregateValidation.requireOccupancyAggregateRows(
        {
          data: [row],
          granularity: "hour",
          scenario_id: "scenario-a",
          timezone: "UTC",
        },
        "hour",
        "scenario-a",
        resolution.timeZone,
      ),
    /API agregou.*UTC.*America\/Sao_Paulo/,
  );
});

test("papel admin só administra recursos explicitamente concedidos no JWT", () => {
  const now = Date.UTC(2026, 7, 4, 12, 0, 0);
  const user = currentUser();
  const enriched = accessTokenClaims.enrichCurrentUserFromAccessToken(
    user,
    accessToken({
      company_id: user.company_id,
      exp: now / 1000 + 900,
      nbf: now / 1000 - 1,
      role: "admin",
      sub: user.id,
      user_id: user.id,
    }),
    now,
  );

  assert.equal(enriched.role, "admin");
  assert.equal(permissions.hasAnyOperationalPermission(enriched), false);
  assert.equal(permissions.canManageCameras(enriched), false);
  assert.equal(permissions.canManageWorkers(enriched), false);
  assert.equal(permissions.canReadInfrastructureCatalogs(enriched), true);

  const cameraAdmin = accessTokenClaims.enrichCurrentUserFromAccessToken(
    user,
    accessToken({
      company_id: user.company_id,
      exp: now / 1000 + 900,
      permissions: ["cameras_manage"],
      role: "admin",
      user_id: user.id,
    }),
    now,
  );
  assert.equal(permissions.hasAnyOperationalPermission(cameraAdmin), true);
  assert.equal(permissions.canManageCameras(cameraAdmin), true);
  assert.equal(permissions.canManageWorkers(cameraAdmin), false);
  assert.equal(permissions.canManageLocations(cameraAdmin), false);

  const readOnlyAdmin = {
    ...cameraAdmin,
    permissions: [
      {
        can_view: true,
        id: "read-only-workers",
        slug: "workers_manage",
      },
    ],
  };
  assert.equal(permissions.hasAnyOperationalPermission(readOnlyAdmin), false);
  assert.equal(permissions.canManageWorkers(readOnlyAdmin), false);

  const operatorWithStaleGrant = {
    ...cameraAdmin,
    permissions: [{ id: "stale-camera", slug: "cameras_manage" }],
    role: "operator",
  };
  assert.equal(permissions.hasAnyOperationalPermission(operatorWithStaleGrant), false);
  assert.equal(permissions.canManageCameras(operatorWithStaleGrant), false);
  assert.equal(
    permissions.canReadInfrastructureCatalogs(operatorWithStaleGrant),
    false,
  );
  assert.equal(
    accessTokenClaims.accessTokenDeclaresMasterAccess(
      accessToken({ ...validMasterTime(now), role: "admin" }),
      now,
    ),
    false,
  );
});

test("JWT migrado aceita identidade canônica e metadados nested sem mascarar /auth/me", () => {
  const now = Date.UTC(2026, 7, 25, 12, 0, 0);
  const user = currentUser();
  const token = accessToken({
    company: {
      id: user.company_id,
      metadata: { timezone: "America/Sao_Paulo" },
    },
    exp: now / 1000 + 900,
    permissions: [
      "occupancy_manage",
      {
        can_view: true,
        id: "widget-permission-jwt",
        slug: "dashboard_widgets_manage",
      },
      {
        can_view: false,
        slug: "workers_manage",
      },
    ],
    role: "admin",
    sub: "subject-externo",
    user_id: user.id,
  });

  assert.deepEqual(
    accessTokenClaims.resolveAccessTokenContext(token, now),
    {
      companyId: user.company_id,
      expiresAt: now / 1000 + 900,
      issuedAt: null,
      isMaster: false,
      notBefore: null,
      role: "admin",
      timeZone: "America/Sao_Paulo",
      userId: user.id,
    },
  );
  const reconciled = accessTokenClaims.reconcileCurrentUserWithAccessToken(
    user,
    token,
    now,
  );
  assert.equal(reconciled?.role, "admin");
  assert.deepEqual(reconciled?.permissions, [
    { id: "jwt:occupancy_manage", slug: "occupancy_manage" },
    {
      can_view: true,
      id: "widget-permission-jwt",
      slug: "dashboard_widgets_manage",
    },
  ]);

  const explicitAuthMePermissions = accessTokenClaims.enrichCurrentUserFromAccessToken(
    { ...user, permissions: [] },
    token,
    now,
  );
  assert.deepEqual(
    explicitAuthMePermissions.permissions,
    [
      { id: "jwt:occupancy_manage", slug: "occupancy_manage" },
      {
        can_view: true,
        id: "widget-permission-jwt",
        slug: "dashboard_widgets_manage",
      },
    ],
    "a autorização do JWT aceito deve vencer uma lista legada de /auth/me",
  );

  const malformedPermissionClaims = accessTokenClaims.enrichCurrentUserFromAccessToken(
    user,
    accessToken({
      company_id: user.company_id,
      exp: now / 1000 + 900,
      permissions: { occupancy_manage: true },
      role: "operator",
      user_id: user.id,
    }),
    now,
  );
  assert.equal(
    malformedPermissionClaims.permissions.length,
    0,
    "um formato declarado mas desconhecido deve falhar fechado",
  );

  const nestedPermissions = accessTokenClaims.enrichCurrentUserFromAccessToken(
    user,
    accessToken({
      authorization: { permission_slugs: ["occupancy_manage"] },
      company_id: user.company_id,
      exp: now / 1000 + 900,
      role: "operator",
      user_id: user.id,
    }),
    now,
  );
  assert.deepEqual(nestedPermissions.permissions, [
    { id: "jwt:occupancy_manage", slug: "occupancy_manage" },
  ]);

  const conflictingPermissionAliases =
    accessTokenClaims.enrichCurrentUserFromAccessToken(
      user,
      accessToken({
        company_id: user.company_id,
        exp: now / 1000 + 900,
        permission_slugs: ["workers_manage"],
        permissions: ["occupancy_manage"],
        role: "operator",
        user_id: user.id,
      }),
      now,
    );
  assert.equal(
    conflictingPermissionAliases.permissions.length,
    0,
    "aliases de autorização divergentes devem falhar de forma fechada",
  );

  const foreignPermissionScope = accessTokenClaims.enrichCurrentUserFromAccessToken(
    user,
    accessToken({
      company_id: user.company_id,
      exp: now / 1000 + 900,
      permissions: [
        { company_id: "company-foreign", slug: "occupancy_manage" },
      ],
      role: "operator",
      user_id: user.id,
    }),
    now,
  );
  assert.equal(
    foreignPermissionScope.permissions.length,
    0,
    "uma permissão escopada a outra empresa não pode habilitar a UI",
  );

  const authProviderSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  assert.match(
    authProviderSource,
    /user\.permissions \?\? fallbackUser\?\.permissions \?\? \[\]/,
    "as permissões autenticadas atuais devem vencer o snapshot anterior",
  );
  assert.match(
    authProviderSource,
    /if \(user\.permissions !== undefined\) \{[\s\S]*?enrichAuthenticatedPermissionMetadata\([\s\S]*?user\.permissions[\s\S]*?assignedMetadata[\s\S]*?permissionCatalog/,
    "permissões explícitas do JWT só podem receber metadados das rotas Swagger",
  );
});

test("catálogos Swagger apenas enriquecem grants autenticados correspondentes", () => {
  const authenticatedGrants = [
    { id: "jwt:occupancy_create", slug: "occupancy_create" },
    { id: "jwt:workers_manage", slug: "workers_manage" },
  ];
  const assignedMetadata = [
    {
      action: "create",
      company_id: "company-a",
      id: "assignment-occupancy",
      module: {
        id: "module-occupancy",
        name: "Ocupação",
        slug: "occupancy",
      },
      slug: "occupancy_create",
    },
    {
      company_id: "company-a",
      id: "assignment-extra",
      module: {
        id: "module-cameras",
        name: "Câmeras",
        slug: "cameras",
      },
      slug: "cameras_manage",
    },
  ];
  const permissionCatalog = [
    {
      action: "manage",
      id: "catalog-workers",
      module_id: "module-workers",
      module: {
        active: true,
        description: "Workers de ingestão",
        id: "module-workers",
        name: "Workers",
        slug: "workers",
      },
      slug: "workers_manage",
    },
  ];

  const reconciled =
    authenticatedPermissionMetadata.enrichAuthenticatedPermissionMetadata(
      authenticatedGrants,
      [assignedMetadata, permissionCatalog],
      "company-a",
    );

  assert.deepEqual(
    reconciled.map((permission) => permission.slug),
    ["occupancy_create", "workers_manage"],
    "um grant extra do endpoint não pode ser fabricado na sessão",
  );
  assert.deepEqual(reconciled[0], {
    action: "create",
    id: "jwt:occupancy_create",
    module_id: "module-occupancy",
    module: {
      id: "module-occupancy",
      name: "Ocupação",
      slug: "occupancy",
    },
    slug: "occupancy_create",
  });
  assert.deepEqual(reconciled[1], {
    action: "manage",
    id: "jwt:workers_manage",
    module_id: "module-workers",
    module: {
      description: "Workers de ingestão",
      id: "module-workers",
      name: "Workers",
      slug: "workers",
    },
    slug: "workers_manage",
  });
  assert.equal(
    Object.hasOwn(reconciled[1], "can_edit"),
    false,
    "capabilities do catálogo não podem ampliar a autorização JWT",
  );
  assert.deepEqual(
    authenticatedPermissionMetadata.enrichAuthenticatedPermissionMetadata(
      [],
      [assignedMetadata],
      "company-a",
    ),
    [],
    "uma lista JWT explicitamente vazia deve permanecer vazia",
  );

  const opaqueGrant = { id: "jwt:opaque", slug: "permission-opaque" };
  const [readGrant] =
    authenticatedPermissionMetadata.enrichAuthenticatedPermissionMetadata(
      [opaqueGrant],
      [[
        {
          action: "view",
          id: "catalog-opaque",
          module_id: "module-counting",
          module: {
            id: "module-counting",
            name: "Contagem",
            slug: "counting",
          },
          slug: "permission-opaque",
        },
      ]],
      "company-a",
    );
  assert.equal(readGrant.action, "view");
  assert.equal(
    permissions.canViewCounting({
      ...currentUser(),
      role: "operator",
      permissions: [readGrant],
    }),
    true,
    "action e módulo estáveis do catálogo devem interpretar um slug JWT opaco",
  );
});

test("reconciliação de metadados rejeita tenant ou módulo ambíguo", () => {
  const grant = {
    company_id: "company-a",
    id: "jwt:create",
    module_id: "module-occupancy",
    slug: "create",
    action: "create",
  };
  const matchingCatalog = {
    action: "create",
    id: "catalog-occupancy-create",
    module_id: "module-occupancy",
    module: {
      id: "module-occupancy",
      name: "Ocupação",
      slug: "occupancy",
    },
    slug: "occupancy_create",
  };

  assert.deepEqual(
    authenticatedPermissionMetadata.enrichAuthenticatedPermissionMetadata(
      [grant],
      [[matchingCatalog]],
      "company-a",
    )[0],
    {
      ...grant,
      module: matchingCatalog.module,
    },
    "ação genérica só pode ser ligada por identidade de módulo coincidente",
  );

  const foreignMetadata = {
    ...matchingCatalog,
    company_id: "company-b",
    slug: "create",
  };
  assert.deepEqual(
    authenticatedPermissionMetadata.enrichAuthenticatedPermissionMetadata(
      [grant],
      [[foreignMetadata]],
      "company-a",
    ),
    [grant],
  );

  const genericGrant = { id: "jwt:manage", slug: "manage" };
  const ambiguous = authenticatedPermissionMetadata.enrichAuthenticatedPermissionMetadata(
    [genericGrant],
    [[
      {
        id: "catalog-a",
        module_id: "module-a",
        module: { id: "module-a", name: "A", slug: "a" },
        slug: "manage",
      },
      {
        id: "catalog-b",
        module_id: "module-b",
        module: { id: "module-b", name: "B", slug: "b" },
        slug: "manage",
      },
    ]],
    "company-a",
  );
  assert.deepEqual(ambiguous, [genericGrant]);
});

test("permissão JWT nested preserva o módulo necessário para autorizar Ocupação", () => {
  const now = Date.UTC(2026, 7, 25, 13, 0, 0);
  const user = currentUser();
  const token = accessToken({
    authorization: {
      company_id: user.company_id,
      permissions: [
        {
          action: "create",
          can_create: true,
          id: "occupancy-create-jwt",
          module_id: "occupancy-module",
          module: {
            active: true,
            description: "Módulo de Ocupação",
            id: "occupancy-module",
            name: "Ocupação",
            slug: "occupancy",
          },
          slug: "create",
        },
      ],
    },
    company_id: user.company_id,
    exp: now / 1000 + 900,
    role: "admin",
    sub: "subject-do-provedor",
    user_id: user.id,
  });

  const reconciled = accessTokenClaims.reconcileCurrentUserWithAccessToken(
    user,
    token,
    now,
  );
  assert.deepEqual(reconciled?.permissions, [
    {
      action: "create",
      can_create: true,
      id: "occupancy-create-jwt",
      module_id: "occupancy-module",
      module: {
        active: true,
        description: "Módulo de Ocupação",
        id: "occupancy-module",
        name: "Ocupação",
        slug: "occupancy",
      },
      slug: "create",
    },
  ]);
  assert.equal(
    permissions.canManageOccupancy(reconciled),
    true,
    "o parser não pode remover o contexto de módulo usado pela matriz operacional",
  );

  const repeatedActionSlugs = accessTokenClaims.reconcileCurrentUserWithAccessToken(
    user,
    accessToken({
      authorization: {
        company_id: user.company_id,
        permissions: [
          {
            action: "create",
            can_create: true,
            module: {
              id: "occupancy-module",
              name: "Ocupação",
              slug: "occupancy",
            },
            slug: "create",
          },
          {
            action: "create",
            can_create: true,
            module: {
              id: "counting-module",
              name: "Contagem",
              slug: "counting",
            },
            slug: "create",
          },
        ],
      },
      company_id: user.company_id,
      exp: now / 1000 + 900,
      role: "admin",
      user_id: user.id,
    }),
    now,
  );
  assert.deepEqual(
    repeatedActionSlugs?.permissions?.map((permission) => permission.module?.slug),
    ["occupancy", "counting"],
    "ações genéricas repetidas devem permanecer separadas pelo módulo",
  );

  const conflictingModule = accessTokenClaims.reconcileCurrentUserWithAccessToken(
    user,
    accessToken({
      authorization: {
        company_id: user.company_id,
        permissions: [
          {
            can_create: true,
            module_id: "occupancy-module",
            module: {
              id: "foreign-module",
              name: "Ocupação",
              slug: "occupancy",
            },
            slug: "create",
          },
        ],
      },
      company_id: user.company_id,
      exp: now / 1000 + 900,
      role: "admin",
      user_id: user.id,
    }),
    now,
  );
  assert.equal(
    conflictingModule?.permissions?.length,
    0,
    "IDs de módulo divergentes não podem fabricar uma concessão no navegador",
  );

  const conflictingDeclarations = accessTokenClaims.reconcileCurrentUserWithAccessToken(
    user,
    accessToken({
      authorization: {
        permissions: [
          {
            can_create: true,
            module: {
              id: "counting-module",
              name: "Contagem",
              slug: "counting",
            },
            slug: "create",
          },
        ],
      },
      company_id: user.company_id,
      exp: now / 1000 + 900,
      permissions: [
        {
          can_create: true,
          module: {
            id: "occupancy-module",
            name: "Ocupação",
            slug: "occupancy",
          },
          slug: "create",
        },
      ],
      role: "admin",
      user_id: user.id,
    }),
    now,
  );
  assert.equal(
    conflictingDeclarations?.permissions?.length,
    0,
    "declarações duplicadas com o mesmo slug e módulos distintos devem falhar fechadas",
  );
});

test("contexto JWT reconcilia identidade, empresa, papel e validade sem adivinhar conflitos", () => {
  const now = Date.UTC(2026, 7, 12, 12, 0, 0);
  const claims = {
    company_id: "company-jwt",
    exp: now / 1000 + 900,
    iat: now / 1000 - 30,
    nbf: now / 1000 - 1,
    role: "super_admin",
    sub: "user-jwt",
    user_id: "user-jwt",
  };
  const token = accessToken(claims);
  const context = accessTokenClaims.resolveAccessTokenContext(token, now);

  assert.deepEqual(context, {
    companyId: "company-jwt",
    expiresAt: claims.exp,
    issuedAt: claims.iat,
    isMaster: true,
    notBefore: claims.nbf,
    role: "super-admin",
    timeZone: "",
    userId: "user-jwt",
  });
  assert.equal(
    accessTokenClaims.accessTokenExpirationMilliseconds(token),
    claims.exp * 1000,
  );

  const enriched = accessTokenClaims.enrichCurrentUserFromAccessToken(
    {
      company_id: undefined,
      email: "jwt@example.com",
      id: "user-jwt",
      is_master: false,
      name: "JWT",
    },
    token,
    now,
  );
  assert.equal(enriched.company_id, "company-jwt");
  assert.equal(enriched.role, "super-admin");
  assert.equal(
    enriched.is_master,
    true,
    "papel Master assinado no JWT complementa um boolean legado divergente do /auth/me",
  );
  assert.equal(
    permissions.hasAnyOperationalPermission(enriched),
    true,
    "a navegação deve reconhecer a mesma autorização Master que o JWT envia à API",
  );

  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({ ...claims, companyId: "company-other" }),
      now,
    ),
    null,
    "aliases divergentes não podem escolher um tenant arbitrariamente",
  );
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({ ...claims, exp: "invalid" }),
      now,
    ),
    null,
  );
  const contextWithInvalidTimeZone =
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({ ...claims, timezone: "Invalid/Timezone" }),
      now,
    );
  assert.equal(contextWithInvalidTimeZone?.userId, "user-jwt");
  assert.equal(
    contextWithInvalidTimeZone?.timeZone,
    "",
    "timezone opcional inválido não pode derrubar a identidade autenticada",
  );

  const contextDuringTimeZoneMigration =
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({
        ...claims,
        company_timezone: "America/Manaus",
        timezone: "America/Sao_Paulo",
      }),
      now,
    );
  assert.equal(
    contextDuringTimeZoneMigration?.timeZone,
    "America/Manaus",
    "o claim específico da empresa deve vencer o alias genérico transitório",
  );
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({
        ...claims,
        company_timezone: "America/Manaus",
        companyTimezone: "America/Sao_Paulo",
      }),
      now,
    )?.timeZone,
    "",
    "claims específicos divergentes continuam sem certificação",
  );
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({
        ...claims,
        company_timezone: null,
        timezone: "America/Sao_Paulo",
      }),
      now,
    )?.timeZone,
    "",
    "claim específico nulo não pode herdar um timezone genérico",
  );
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({
        ...claims,
        company: {
          id: "company-other",
          timezone: "Asia/Tokyo",
        },
      }),
      now,
    ),
    null,
    "empresa flat e nested divergentes invalidam o enriquecimento",
  );
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({
        ...claims,
        company: {
          id: claims.company_id,
          company_timezone: "Asia/Tokyo",
        },
        company_timezone: "America/Manaus",
      }),
      now,
    )?.timeZone,
    "",
    "fusos divergentes no mesmo tenant não podem ser escolhidos por ordem",
  );
  assert.equal(
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      {
        company_id: "company-auth-me",
        email: "master@example.com",
        id: "master-global",
        is_master: true,
        name: "Master",
      },
      accessToken({
        exp: claims.exp,
        role: "super-admin",
        sub: "master-global",
      }),
      now,
    )?.company_id,
    "company-auth-me",
    "master global pode ter empresa explícita no /auth/me mesmo sem claim company_id",
  );
  const selectedCompanyMaster =
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      {
        company_id: "company-selected",
        email: "master@example.com",
        id: "master-global",
        is_master: true,
        name: "Master",
      },
      accessToken({
        company_id: "company-home",
        company_timezone: "America/Manaus",
        exp: claims.exp,
        role: "super-admin",
        sub: "master-global",
      }),
      now,
    );
  assert.equal(
    selectedCompanyMaster?.company_id,
    "company-selected",
    "master global pode ter empresa contextual diferente da empresa-base do JWT",
  );
  assert.equal(
    selectedCompanyMaster?.company_timezone,
    undefined,
    "o fuso da empresa-base do JWT não pode certificar a empresa selecionada",
  );
  const authenticatedRegularUser = {
    company_id: "company-selected",
    email: "regular@example.com",
    id: "regular-user",
    is_master: false,
    name: "Regular",
  };
  assert.strictEqual(
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      authenticatedRegularUser,
      accessToken({
        company_id: "company-home",
        exp: claims.exp,
        role: "admin",
        sub: "regular-user",
      }),
      now,
    ),
    authenticatedRegularUser,
    "/auth/me 200 permanece autoritativo, mas claims de outro tenant não complementam papel nem empresa",
  );
});

test("role do JWT aceito vence metadado legado sem atravessar identidade ou empresa", () => {
  const now = Date.UTC(2026, 7, 4, 12, 0, 0);
  const user = currentUser();
  const validClaims = {
    company_id: user.company_id,
    exp: now / 1000 + 900,
    nbf: now / 1000 - 1,
    role: "admin",
    sub: user.id,
    user_id: user.id,
  };

  for (const claims of [
    { ...validClaims, user_id: "user-other" },
    { ...validClaims, company_id: "company-other" },
    { ...validClaims, exp: now / 1000 },
    { ...validClaims, nbf: now / 1000 + 61 },
  ]) {
    assert.strictEqual(
      accessTokenClaims.enrichCurrentUserFromAccessToken(
        user,
        accessToken(claims),
        now,
      ),
      user,
    );
  }

  const genericSubject = accessTokenClaims.enrichCurrentUserFromAccessToken(
    user,
    accessToken({ ...validClaims, sub: "subject-do-provedor" }),
    now,
  );
  assert.equal(
    genericSubject.role,
    "admin",
    "sub genérico não conflita com o user_id canônico da aplicação",
  );

  const emailSubject = accessTokenClaims.enrichCurrentUserFromAccessToken(
    user,
    accessToken({
      company_id: user.company_id,
      exp: now / 1000 + 900,
      role: "admin",
      sub: user.email.toUpperCase(),
    }),
    now,
  );
  assert.equal(
    emailSubject.role,
    "admin",
    "sub em formato de e-mail pode identificar o mesmo /auth/me",
  );

  const explicitRole = { ...user, role: "operator" };
  const signedRole = accessTokenClaims.enrichCurrentUserFromAccessToken(
    explicitRole,
    accessToken(validClaims),
    now,
  );
  assert.equal(signedRole.role, "admin");
  assert.notStrictEqual(signedRole, explicitRole);
  assert.strictEqual(
    accessTokenClaims.enrichCurrentUserFromAccessToken(user, "inválido", now),
    user,
  );
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({ ...validClaims, nbf: now / 1000 + 60 }),
      now,
    )?.userId,
    user.id,
    "o navegador tolera até 60s de diferença de relógio quando a API já aceitou o JWT",
  );
});

test("refresh atrasado da conta anterior não sobrescreve o novo tenant", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  let resolveOldRefresh;
  let markRefreshStarted;
  const refreshStarted = new Promise((resolveStarted) => {
    markRefreshStarted = resolveStarted;
  });
  const oldRefreshResponse = new Promise((resolveResponse) => {
    resolveOldRefresh = resolveResponse;
  });
  const workerAuthorization = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path.endsWith("/auth/refresh")) {
      markRefreshStarted();
      return oldRefreshResponse;
    }
    if (path.endsWith("/auth/login")) {
      return jsonResponse({
        access_token: "access-company-new",
        expires_in: 900,
        refresh_token: "refresh-company-new",
        token_type: "Bearer",
      });
    }
    if (path.endsWith("/workers")) {
      workerAuthorization.push(
        new Headers(init.headers).get("Authorization"),
      );
      return jsonResponse([]);
    }
    throw new Error(`Requisição inesperada: ${path}`);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: "access-company-old",
      expires_in: 1,
      refresh_token: "refresh-company-old",
      token_type: "Bearer",
    });

    const oldRequest = api.apiFetch("/workers");
    await refreshStarted;
    await api.loginRequest("new-company@example.com", "password");
    resolveOldRefresh(
      jsonResponse({
        access_token: "late-access-company-old",
        expires_in: 900,
        refresh_token: "late-refresh-company-old",
        token_type: "Bearer",
      }),
    );
    await oldRequest;

    assert.equal(storage.getItem("access_token"), "access-company-new");
    assert.equal(storage.getItem("refresh_token"), "refresh-company-new");
    assert.deepEqual(workerAuthorization, ["Bearer access-company-new"]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("escopo selecionado pelo master segue apenas para rotas tenant-aware", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    requests.push({
      path: String(url),
      companyId: new Headers(init.headers).get("X-Company-ID"),
    });
    return jsonResponse([]);
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "super-admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-master",
      token_type: "Bearer",
    });
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-selected",
      name: "Empresa selecionada",
    });

    await api.apiFetch("/cameras");
    await api.apiFetch("/analytics/aggregate?granularity=hour");
    await api.apiFetch("/companies/company-selected/users");
    await api.apiFetch("/cameras", {
      companyScopeId: "company-explicit",
    });
    await api.apiFetch("/users/user-selected", {
      method: "PUT",
      body: {
        name: "Usuário",
        email: "usuario@empresa.com",
        is_master: false,
        active: true,
      },
      companyScopeId: "company-explicit",
    });
    await api.apiFetch("/users/master-home/permissions", {
      jwtCompanyScopeOnly: true,
    });
    await api.apiFetch("/users/me/grid");
    await api.apiFetch("/auth/me", {
      headers: { "X-Company-ID": "company-forged" },
    });
    await api.apiFetch("/companies");
    await api.apiFetch("/users-export");
    await assert.rejects(
      () =>
        api.apiFetch("/companies/company-path/users", {
          companyScopeId: "company-other",
        }),
      (error) => error instanceof api.ApiError && error.status === 403,
    );

    assert.deepEqual(requests, [
      { path: "/api/v1/cameras", companyId: "company-selected" },
      {
        path: "/api/v1/analytics/aggregate?granularity=hour",
        companyId: "company-selected",
      },
      {
        path: "/api/v1/companies/company-selected/users",
        companyId: null,
      },
      { path: "/api/v1/cameras", companyId: "company-explicit" },
      {
        path: "/api/v1/users/user-selected",
        companyId: "company-explicit",
      },
      { path: "/api/v1/users/master-home/permissions", companyId: null },
      { path: "/api/v1/users/me/grid", companyId: null },
      { path: "/api/v1/auth/me", companyId: null },
      { path: "/api/v1/companies", companyId: null },
      { path: "/api/v1/users-export", companyId: null },
    ]);

    requests.length = 0;
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        role: "admin",
      }),
      expires_in: 900,
      refresh_token: "refresh-company-user",
      token_type: "Bearer",
    });
    await api.apiFetch("/cameras", {
      headers: { "X-Company-ID": "company-forged" },
    });
    assert.deepEqual(requests, [
      { path: "/api/v1/cameras", companyId: null },
    ]);

    requests.length = 0;
    masterCompanyScope.clearStoredMasterCompanyScope();
    masterCompanyScope.setStoredCurrentCompanyScope({
      id: "company-regular",
      name: "Empresa do usuário",
    });
    await api.apiFetch("/cameras");
    assert.deepEqual(requests, [
      { path: "/api/v1/cameras", companyId: null },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("usuário comum consulta exclusivamente a empresa assinada no JWT", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    requests.push({
      authorization: new Headers(init.headers).get("Authorization"),
      companyId: new Headers(init.headers).get("X-Company-ID"),
      path: String(url),
    });
    return jsonResponse([]);
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        company_id: "company-jwt",
        exp: nowSeconds + 900,
        iat: nowSeconds - 10,
        nbf: nowSeconds - 1,
        role: "admin",
        sub: "user-jwt",
        user_id: "user-jwt",
      }),
      expires_in: 900,
      refresh_token: "refresh-jwt",
      token_type: "Bearer",
    });

    await assert.rejects(
      () =>
        api.apiFetch("/cameras", {
          companyScopeId: "company-other",
        }),
      (error) => error instanceof api.ApiError && error.status === 403,
    );
    assert.equal(requests.length, 0);

    await api.apiFetch("/cameras", { companyScopeId: "company-jwt" });
    assert.equal(requests.length, 1);
    assert.match(requests[0].authorization ?? "", /^Bearer /);
    assert.equal(requests[0].companyId, null);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("master confirmado por auth me escopa recursos mesmo quando o JWT omite a função", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    requests.push({
      path: String(url),
      companyId: new Headers(init.headers).get("X-Company-ID"),
    });
    return jsonResponse([]);
  };

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({
        exp: nowSeconds + 900,
        nbf: nowSeconds - 1,
        sub: "master-with-legacy-token",
      }),
      expires_in: 900,
      refresh_token: "refresh-master-with-legacy-token",
      token_type: "Bearer",
    });
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-selected-from-auth-me",
      name: "Empresa selecionada",
    });
    api.setAuthenticatedMasterAccess({
      email: "master@example.com",
      id: "master-with-legacy-token",
      is_master: true,
      name: "Master",
    });

    await api.apiFetch("/workers");
    await api.apiFetch("/locations");
    await api.apiFetch("/cameras");

    assert.deepEqual(requests, [
      {
        path: "/api/v1/workers",
        companyId: "company-selected-from-auth-me",
      },
      {
        path: "/api/v1/locations",
        companyId: "company-selected-from-auth-me",
      },
      {
        path: "/api/v1/cameras",
        companyId: "company-selected-from-auth-me",
      },
    ]);

    requests.length = 0;
    api.setAuthenticatedMasterAccess({
      company_id: "company-regular",
      email: "regular@example.com",
      id: "regular",
      is_master: false,
      name: "Regular",
    });
    await api.apiFetch("/workers", {
      companyScopeId: "company-forged",
      headers: { "X-Company-ID": "company-forged" },
    });
    assert.deepEqual(requests, [
      { path: "/api/v1/workers", companyId: null },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("confirmação master de auth me acompanha a rotação do access token", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path === "/api/v1/auth/refresh") {
      return jsonResponse({
        access_token: accessToken({
          role: "super-admin",
          sub: "master-before-refresh",
        }),
        expires_in: 900,
        refresh_token: "refresh-master-rotated",
        token_type: "Bearer",
      });
    }
    requests.push({
      path,
      companyId: new Headers(init.headers).get("X-Company-ID"),
    });
    return jsonResponse([]);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({ sub: "master-before-refresh" }),
      expires_at: Date.now() + 1_000,
      expires_in: 1,
      refresh_token: "refresh-master-rotated",
      token_type: "Bearer",
    });
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-after-refresh",
      name: "Empresa após refresh",
    });
    api.setAuthenticatedMasterAccess({
      email: "master@example.com",
      id: "master-before-refresh",
      is_master: true,
      name: "Master",
    });

    await api.apiFetch("/workers");
    assert.deepEqual(requests, [
      {
        path: "/api/v1/workers",
        companyId: "company-after-refresh",
      },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("confirmação master é removida quando o JWT renovado perde o papel", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path === "/api/v1/auth/refresh") {
      return jsonResponse({
        access_token: accessToken({
          role: "operator",
          sub: "master-demoted-after-refresh",
        }),
        expires_in: 900,
        refresh_token: "refresh-master-demoted",
        token_type: "Bearer",
      });
    }
    requests.push({
      path,
      companyId: new Headers(init.headers).get("X-Company-ID"),
    });
    return jsonResponse([]);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({ sub: "master-demoted-after-refresh" }),
      expires_at: Date.now() + 1_000,
      expires_in: 1,
      refresh_token: "refresh-master-demoted",
      token_type: "Bearer",
    });
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-must-not-survive-demotion",
      name: "Empresa selecionada",
    });
    api.setAuthenticatedMasterAccess({
      email: "master@example.com",
      id: "master-demoted-after-refresh",
      is_master: true,
      name: "Master",
    });

    await api.apiFetch("/workers");
    assert.deepEqual(requests, [
      { path: "/api/v1/workers", companyId: null },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("confirmação master não atravessa refresh para outra identidade", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path === "/api/v1/auth/refresh") {
      return jsonResponse({
        access_token: accessToken({ sub: "different-user-after-refresh" }),
        expires_in: 900,
        refresh_token: "refresh-master-identity-changed",
        token_type: "Bearer",
      });
    }
    requests.push({
      path,
      companyId: new Headers(init.headers).get("X-Company-ID"),
    });
    return jsonResponse([]);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: accessToken({ sub: "master-before-refresh" }),
      expires_at: Date.now() + 1_000,
      expires_in: 1,
      refresh_token: "refresh-master-identity-changed",
      token_type: "Bearer",
    });
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-must-not-cross-identity",
      name: "Empresa selecionada",
    });
    api.setAuthenticatedMasterAccess({
      email: "master@example.com",
      id: "master-before-refresh",
      is_master: true,
      name: "Master",
    });

    await api.apiFetch("/workers");
    assert.deepEqual(requests, [
      {
        path: "/api/v1/workers",
        companyId: null,
      },
    ]);
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("worker sem company id só é aceito quando a resposta escopada não mistura empresas", () => {
  const target = { company_id: "company-selected", id: "worker-target" };
  const unscoped = { id: "worker-legacy" };
  const foreign = { company_id: "company-foreign", id: "worker-foreign" };

  const compatible = workerScope.partitionWorkersByCompanyScope(
    [target, unscoped],
    "company-selected",
  );
  assert.deepEqual(
    workerScope
      .workersFromExplicitCompanyScope(compatible)
      .map((worker) => worker.id),
    ["worker-target", "worker-legacy"],
  );

  const mixed = workerScope.partitionWorkersByCompanyScope(
    [target, unscoped, foreign],
    "company-selected",
  );
  assert.deepEqual(
    workerScope
      .workersFromExplicitCompanyScope(mixed)
      .map((worker) => worker.id),
    ["worker-target"],
  );
});

test("alias company_id vazio não mascara empresa nested explícita", () => {
  const nestedForeign = {
    company_id: "",
    company: { id: "company-foreign" },
    id: "row-foreign",
  };

  assert.equal(
    masterCompanyScope.getEntityCompanyId(nestedForeign),
    "company-foreign",
  );
  assert.deepEqual(
    masterCompanyScope.filterScopedApiRows(
      [nestedForeign],
      "company-selected",
    ),
    [],
    "registro nested de outra empresa deve continuar fail-closed",
  );
  assert.equal(
    masterCompanyScope.getCurrentUserCompanyId({
      company_id: "",
      company: { id: "company-selected" },
    }),
    "company-selected",
  );
});

test("gestores operacionais encaminham explicitamente a empresa efetiva", () => {
  const workerSource = readFileSync(
    resolve(projectRoot, "components/app/worker-manager.tsx"),
    "utf8",
  );
  const infrastructureSource = readFileSync(
    resolve(projectRoot, "components/app/infrastructure-manager.tsx"),
    "utf8",
  );
  const superAdminSource = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    workerSource,
    /fetchCompanyWorkers\(requestedCompanyId\)[\s\S]*?apiFetch<unknown>\("\/workers", \{ companyScopeId \}\)/,
  );
  assert.match(
    workerSource,
    /apiFetch<T>\(path, \{ body, companyScopeId, method \}\)/,
  );
  assert.match(
    infrastructureSource,
    /apiFetch<Location\[]>\("\/locations", \{[\s\S]*?companyScopeId: requestedCompanyScopeId[\s\S]*?apiFetch<Camera\[]>\("\/cameras", \{[\s\S]*?companyScopeId: requestedCompanyScopeId/,
  );
  assert.match(
    infrastructureSource,
    /apiFetch<unknown>\("\/workers", \{ companyScopeId \}\)/,
  );
  assert.match(
    superAdminSource,
    /fetchScopedWorkers\(companyId\)[\s\S]*?fetchValidatedRows\("\/locations"[\s\S]*?fetchValidatedRows\("\/cameras"/,
  );
  assert.match(
    superAdminSource,
    /loadCompanyDetails = React\.useCallback\(async \(expectedCompanyId: string\)[\s\S]*?selectedCompanyIdRef\.current !== companyId[\s\S]*?canPublishCompanyDetails\(requestSequence, companyId\)/,
  );
  assert.match(
    superAdminSource,
    /loadUserPermissions\(userId: string, companyId: string\)[\s\S]*?isCurrentUserPermissionRequest\([\s\S]*?userPermissionRequestContextRef\.current/,
  );
  assert.match(
    superAdminSource,
    /selectCompanyId = React\.useCallback\([\s\S]*?\(companyId: string\)[\s\S]*?invalidateUserPermissionRequest\(\{ closeDialog: true \}\)/,
  );
  assert.match(
    workerSource,
    /workerMutationSequenceRef[\s\S]*?isCurrentWorkerMutation\(mutationSequence, requestedCompanyId\)[\s\S]*?setKeyNotice/,
  );
});

test("painel master isola falhas operacionais sem apagar dados administrativos certificados", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const loadStart = source.indexOf("const loadCompanyDetails = React.useCallback");
  const loadEnd = source.indexOf("React.useEffect(() =>", loadStart);
  const loadSource = source.slice(loadStart, loadEnd);
  const administrativePublish = loadSource.indexOf(
    "setUsers(scopedUserRows.filter",
  );
  const isolatedOperationalLoad = loadSource.indexOf("Promise.allSettled([");
  const operationalPublish = loadSource.indexOf(
    "setCompanyOperationalWarnings(operationalWarnings)",
  );

  assert.ok(loadStart >= 0 && loadEnd > loadStart);
  assert.ok(
    administrativePublish >= 0 &&
      isolatedOperationalLoad > administrativePublish &&
      operationalPublish > isolatedOperationalLoad,
    "usuários e módulos devem ser publicados antes das consultas operacionais isoladas",
  );
  assert.match(
    loadSource,
    /Promise\.allSettled\(\[[\s\S]*?fetchScopedWorkers\(companyId\)[\s\S]*?fetchValidatedRows\("\/locations"[\s\S]*?fetchValidatedRows\("\/cameras"[\s\S]*?fetchValidatedRows\("\/scenarios"[\s\S]*?fetchScopedOccupancyScenarios\(companyId\)/,
  );
  for (const resource of [
    "workers",
    "locations",
    "cameras",
    "countingScenarios",
    "occupancyScenarios",
  ]) {
    assert.match(
      loadSource,
      new RegExp(`certifiedSettledRows\\([\\s\\S]*?"${resource}"`),
      `${resource} deve produzir sucesso certificado ou aviso próprio`,
    );
  }
  assert.ok(
    (loadSource.match(/canPublishCompanyDetails\(requestSequence, companyId\)/g)
      ?.length ?? 0) >= 3,
    "publicações administrativas e operacionais devem continuar protegidas contra respostas tardias",
  );
  assert.match(loadSource, /cameras: scopedCameras\?\.length \?\? null/);
  assert.match(loadSource, /countingScenarios: scopedScenarios\?\.length \?\? null/);
  assert.match(
    loadSource,
    /if \(administrativeDetailsCertified\) \{[\s\S]*?allOperationalResourceWarnings\([\s\S]*?message,[\s\S]*?\)[\s\S]*?\} else \{[\s\S]*?setUsers\(\[\]\)[\s\S]*?setCompanyModules\(\[\]\)/,
    "uma falha operacional inesperada também não pode apagar usuários ou módulos já certificados",
  );
  assert.match(
    source,
    /fetchScopedWorkers\(companyScopeId: string\)[\s\S]*?requireWorkerRows\(value, companyScopeId\)/,
    "mismatch explícito de worker deve continuar fail-closed",
  );
  assert.match(
    source,
    /fetchValidatedRows<T>[\s\S]*?validate\(value, companyScopeId\)/,
    "validadores tenant-aware não podem ser contornados pelo isolamento",
  );
  assert.match(source, /Dados operacionais parciais\./);
});

test("login é transacional e impede submissões concorrentes", () => {
  const authProviderSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  const loginSource = readFileSync(
    resolve(projectRoot, "app/login/page.tsx"),
    "utf8",
  );

  assert.match(
    authProviderSource,
    /const login = React\.useCallback[\s\S]*?await loginRequest[\s\S]*?catch \(error\)[\s\S]*?clearStoredSession\(\)[\s\S]*?clearUserGridSync\(\)[\s\S]*?throw error/,
    "falha após emitir tokens deve desfazer integralmente a sessão",
  );
  assert.match(
    loginSource,
    /submittingRef\.current\) return[\s\S]*?submittingRef\.current = true[\s\S]*?submittingRef\.current = false/,
    "duplo clique não pode iniciar dois logins concorrentes",
  );
  assert.match(
    authProviderSource,
    /currentUserRequestWithAccessToken\(\)[\s\S]*?response\.accessToken[\s\S]*?getStoredSession\(\)\?\.access_token === response\.accessToken[\s\S]*?hydrateAuthenticatedUser\([\s\S]*?response\.accessToken/,
    "a resposta de /auth/me deve ser reconciliada com o JWT que foi realmente enviado",
  );
});

test("bootstrap próprio usa a identidade do JWT sem herdar a empresa visual do master", () => {
  const authProviderSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  const dashboardViewRouteSource = readFileSync(
    resolve(projectRoot, "app/api/v1/dashboard-views/[menuKey]/route.ts"),
    "utf8",
  );

  assert.match(
    authProviderSource,
    /apiFetch<UserPermission\[]>\(\s*`\/users\/\$\{user\.id\}\/permissions`,\s*\{[\s\S]*?jwtCompanyScopeOnly: true/,
  );
  assert.doesNotMatch(authProviderSource, /users\/me\/permissions/);
  assert.match(
    dashboardViewRouteSource,
    /`\/api\/v1\/users\/\$\{encodeURIComponent\(user\.id\)\}\/permissions`/,
  );
  assert.match(
    dashboardViewRouteSource,
    /let permissions = requireUserPermissions\(user\.permissions\);[\s\S]*?if \(user\.permissions === undefined\) \{[\s\S]*?backendFetch\([\s\S]*?\/permissions/,
    "a rota deve usar permissões já reconciliadas do JWT antes do endpoint legado",
  );
  assert.match(
    dashboardViewRouteSource,
    /reconcileCurrentUserWithAccessToken\(rawUser, accessToken\)/,
  );
  assert.match(
    dashboardViewRouteSource,
    /canManageWidgets\(\{ \.\.\.user, permissions \}\)/,
    "um slug residual não pode permitir que Operador grave configurações administrativas",
  );
});

test("atualização automática só executa para catálogo habilitado e visível", () => {
  assert.equal(
    resourceAutoRefresh.shouldAutoRefreshResources({
      enabled: true,
      visibilityState: "visible",
    }),
    true,
  );
  assert.equal(
    resourceAutoRefresh.shouldAutoRefreshResources({
      enabled: true,
      visibilityState: "hidden",
    }),
    false,
  );
  assert.equal(
    resourceAutoRefresh.shouldAutoRefreshResources({
      enabled: false,
      visibilityState: "visible",
    }),
    false,
  );
  assert.ok(
    resourceAutoRefresh.PROVISIONED_RESOURCE_REFRESH_INTERVAL_MS <
      resourceAutoRefresh.RESOURCE_METADATA_REFRESH_INTERVAL_MS,
  );
});

test("timezone ausente é hidratado antes da navegação e acompanha a rotação do JWT", () => {
  const superAdminSource = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const authSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  const apiSource = readFileSync(resolve(projectRoot, "lib/api.ts"), "utf8");
  const ensureStart = superAdminSource.indexOf("const ensureCompanyTimeZone");
  const detailFetch = superAdminSource.indexOf(
    "`/companies/${company.id}`",
    ensureStart,
  );
  const navigationStart = superAdminSource.indexOf(
    "async function openCompanyDashboard",
  );
  const certificationBeforeNavigation = superAdminSource.indexOf(
    "await ensureCompanyTimeZone(company, true)",
    navigationStart,
  );
  const navigation = superAdminSource.indexOf(
    'router.push("/dashboard/live")',
    navigationStart,
  );

  assert.ok(ensureStart >= 0 && detailFetch > ensureStart);
  assert.ok(
    navigationStart >= 0 &&
      certificationBeforeNavigation > navigationStart &&
      navigation > certificationBeforeNavigation,
  );
  assert.match(
    authSource,
    /async function hydrateUserCompany[\s\S]*?`\/companies\/\$\{companyId\}`/,
    "/auth/me parcial deve tentar hidratar o detalhe da própria empresa",
  );
  assert.match(
    authSource,
    /await hydrateStoredMasterCompanyScope\(hydratedUser\)[\s\S]*?async function hydrateStoredMasterCompanyScope[\s\S]*?`\/companies\/\$\{storedScope\.id\}`/,
    "uma recarga direta do superadmin deve reparar o tenant salvo antes do dashboard",
  );
  assert.match(apiSource, /SESSION_UPDATED_EVENT/);
  assert.match(authSource, /SESSION_UPDATED_EVENT/);
});

test("proxy exige destino fixo em produção", () => {
  const source = readFileSync(
    resolve(projectRoot, "lib/backend-routing.ts"),
    "utf8",
  );
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.match(source, /IPXDATA_API_URL é obrigatório em produção/);
  assert.match(source, /if \(configuredUrl\) return normalizeConfiguredUrl/);
});

function currentUser() {
  return {
    company_id: "company-test",
    email: "teste@teste.com",
    id: "user-test",
    is_master: false,
    name: "Teste",
  };
}

function validMasterTime(now) {
  return {
    exp: now / 1000 + 900,
    nbf: now / 1000 - 1,
  };
}

function accessToken(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
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
