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
const api = loadTypeScriptModule("lib/api.ts");
const companyCache = loadTypeScriptModule("lib/company-cache.ts");
const companyTimeZone = loadTypeScriptModule("lib/company-time-zone.ts");
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
        `apiFetch<unknown>\\("/${path}",\\s*\\{\\s*companyScopeId,\\s*signal: controller\\.signal,\\s*\\}\\)`,
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
    /aggregatePath\(definition\),\s*\{[\s\S]*?companyScopeId,[\s\S]*?signal: controller\.signal[\s\S]*?\}/g,
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

test("JWT aceito para /auth/me complementa role admin omitida pela resposta", () => {
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
  assert.equal(permissions.hasAnyOperationalPermission(enriched), true);
  assert.equal(permissions.canManageCameras(enriched), true);
  assert.equal(permissions.canManageWorkers(enriched), true);
  assert.equal(
    accessTokenClaims.accessTokenDeclaresMasterAccess(
      accessToken({ ...validMasterTime(now), role: "admin" }),
      now,
    ),
    false,
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
    false,
    "/auth/me explícito continua prioritário para is_master",
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
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({ ...claims, timezone: "Invalid/Timezone" }),
      now,
    ),
    null,
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
});

test("claims não sobrescrevem role explícita nem atravessam identidade ou empresa", () => {
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
    { ...validClaims, sub: "user-other" },
    { ...validClaims, company_id: "company-other" },
    { ...validClaims, exp: now / 1000 },
    { ...validClaims, nbf: now / 1000 + 60 },
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

  const explicitRole = { ...user, role: "operator" };
  assert.strictEqual(
    accessTokenClaims.enrichCurrentUserFromAccessToken(
      explicitRole,
      accessToken(validClaims),
      now,
    ),
    explicitRole,
  );
  assert.strictEqual(
    accessTokenClaims.enrichCurrentUserFromAccessToken(user, "inválido", now),
    user,
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
        companyId: "company-selected",
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
    /apiFetch<UserPermission\[]>\(`\/users\/\$\{user\.id\}\/permissions`, \{[\s\S]*?jwtCompanyScopeOnly: true/,
  );
  assert.doesNotMatch(authProviderSource, /users\/me\/permissions/);
  assert.match(
    dashboardViewRouteSource,
    /`\/api\/v1\/users\/\$\{encodeURIComponent\(user\.id\)\}\/permissions`/,
  );
  assert.match(
    dashboardViewRouteSource,
    /reconcileCurrentUserWithAccessToken\(rawUser, accessToken\)/,
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
