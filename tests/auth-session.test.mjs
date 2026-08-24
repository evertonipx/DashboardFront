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
const metadataValidation = loadTypeScriptModule("lib/metadata-validation.ts");
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
    )?.companyId,
    "company-jwt",
    "company_id canônico deve vencer aliases de migração divergentes",
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
  assert.equal(contextDuringTimeZoneMigration?.userId, "user-jwt");
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

  const contextWithEquivalentIanaAliases =
    accessTokenClaims.resolveAccessTokenContext(
      accessToken({
        ...claims,
        company_timezone: "US/Eastern",
        timezone: "America/New_York",
      }),
      now,
    );
  assert.equal(
    contextWithEquivalentIanaAliases?.timeZone,
    "America/New_York",
    "aliases equivalentes devem ser comparados após canonicalização IANA",
  );

  const explicitCompanyTimeZone =
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      {
        company_id: "company-jwt",
        company_timezone: "America/Fortaleza",
        email: "jwt@example.com",
        id: "user-jwt",
        is_master: true,
        name: "JWT",
      },
      accessToken({
        ...claims,
        company_timezone: "America/Manaus",
        timezone: "America/Sao_Paulo",
      }),
      now,
    );
  assert.equal(
    explicitCompanyTimeZone?.company_timezone,
    "America/Fortaleza",
    "o cadastro explícito da empresa deve vencer metadados transitórios do JWT",
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

test("user id canônico vence sub legado sem atravessar identidade ou empresa", () => {
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

  const migratedSubject = accessToken({
    ...validClaims,
    sub: user.email,
  });
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(migratedSubject, now)?.userId,
    user.id,
    "user_id deve ter precedência sobre um sub com semântica diferente",
  );
  assert.equal(
    accessTokenClaims.accessTokenMatchesUserIdentity(migratedSubject, user, now),
    true,
  );
  assert.equal(
    accessTokenClaims.enrichCurrentUserFromAccessToken(
      user,
      migratedSubject,
      now,
    ).role,
    "admin",
    "a migração de sub não pode impedir os metadados do mesmo usuário",
  );

  const emailInCanonicalUserId = accessToken({
    ...validClaims,
    sub: user.id,
    user_id: user.email,
  });
  assert.equal(
    accessTokenClaims.accessTokenMatchesUserIdentity(
      emailInCanonicalUserId,
      user,
      now,
    ),
    false,
    "user_id é um ID de aplicação e não pode ser certificado por igualdade com email",
  );
  assert.strictEqual(
    accessTokenClaims.enrichCurrentUserFromAccessToken(
      user,
      emailInCanonicalUserId,
      now,
    ),
    user,
    "sub válido não pode contornar um user_id canônico incompatível",
  );
  assert.equal(
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      user,
      emailInCanonicalUserId,
      now,
    )?.role,
    undefined,
    "um user_id contendo email não pode conceder role ao perfil autoritativo",
  );

  const camelCaseUserId = accessToken({
    ...validClaims,
    sub: "provider-subject-that-is-not-the-user-id",
    user_id: undefined,
    userId: user.id,
  });
  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(camelCaseUserId, now)?.userId,
    user.id,
  );
  assert.equal(
    accessTokenClaims.accessTokenMatchesUserIdentity(camelCaseUserId, user, now),
    true,
  );

  const emailSubject = accessToken({
    company_id: user.company_id,
    exp: now / 1000 + 900,
    role: "admin",
    sub: user.email.toUpperCase(),
  });
  assert.equal(
    accessTokenClaims.accessTokenMatchesUserIdentity(emailSubject, user, now),
    true,
    "sub em formato de email deve reconciliar sem depender de caixa",
  );
  assert.equal(
    accessTokenClaims.reconcileCurrentUserWithAccessToken(user, emailSubject, now)
      ?.role,
    "admin",
  );

  for (const claims of [
    { ...validClaims, user_id: "user-other" },
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

test("claims master conflitantes não elevam o perfil autenticado", () => {
  const now = Date.UTC(2026, 7, 4, 12, 0, 0);
  const user = currentUser();
  const contradictoryToken = accessToken({
    company_id: user.company_id,
    exp: now / 1000 + 900,
    is_master: false,
    role: "super-admin",
    user_id: user.id,
  });

  assert.equal(
    accessTokenClaims.resolveAccessTokenContext(contradictoryToken, now),
    null,
  );
  assert.equal(
    accessTokenClaims.accessTokenDeclaresMasterAccess(contradictoryToken, now),
    false,
  );
  assert.strictEqual(
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      user,
      contradictoryToken,
      now,
    ),
    user,
    "role super-admin não pode vencer is_master false no mesmo JWT",
  );
});

test("auth me 200 com id é autoritativo mesmo para JWT inválido ou desconhecido", () => {
  const now = Date.UTC(2026, 7, 4, 12, 0, 0);
  const user = currentUser();
  const tokensWithoutUsableContext = [
    "jwt-inválido",
    accessToken({
      exp: now / 1000 + 900,
      principal: "claim-ainda-desconhecido-pelo-frontend",
    }),
  ];

  for (const token of tokensWithoutUsableContext) {
    assert.strictEqual(
      accessTokenClaims.reconcileCurrentUserWithAccessToken(user, token, now),
      user,
      "um perfil autenticado não pode ser rejeitado por decodificação local opcional",
    );
  }

  const compatibleOperationalMetadata =
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      user,
      accessToken({
        company_id: user.company_id,
        company_timezone: "America/Manaus",
        exp: now / 1000 + 900,
        principal: "claim-ainda-desconhecido-pelo-frontend",
        role: "admin",
      }),
      now,
    );
  assert.ok(compatibleOperationalMetadata);
  assert.equal(
    compatibleOperationalMetadata.company_timezone,
    "America/Manaus",
    "timezone pode completar a empresa explicitamente idêntica sem conceder acesso",
  );
  assert.equal(
    compatibleOperationalMetadata.role,
    undefined,
    "claim sem identidade comparável não pode conceder papel de acesso",
  );

  const divergentMetadata =
    accessTokenClaims.reconcileCurrentUserWithAccessToken(
      user,
      accessToken({
        company_id: "company-other",
        company_timezone: "America/Manaus",
        exp: now / 1000 + 900,
        role: "admin",
        user_id: "user-other",
      }),
      now,
    );
  assert.ok(divergentMetadata, "o 200 autenticado continua sendo utilizável");
  assert.equal(divergentMetadata.id, user.id);
  assert.equal(divergentMetadata.company_id, user.company_id);
  assert.equal(
    divergentMetadata.company_timezone,
    undefined,
    "metadado de outra empresa não pode completar o perfil autoritativo",
  );
  assert.equal(
    divergentMetadata.role,
    undefined,
    "papel de um principal incompatível não pode elevar o perfil autoritativo",
  );

  for (const token of [
    "jwt-inválido",
    accessToken({
      company_id: user.company_id,
      exp: now / 1000 + 900,
      role: "admin",
      user_id: user.id,
    }),
  ]) {
    assert.equal(
      accessTokenClaims.reconcileCurrentUserWithAccessToken(
        { ...user, id: "" },
        token,
        now,
      ),
      null,
      "auth me precisa fornecer id mesmo quando o JWT possui identidade válida",
    );
  }
});

test("timezone same-tenant sobrevive a migrações de claims não operacionais", () => {
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);
  const user = {
    company_id: "company-timezone",
    email: "timezone@example.com",
    id: "user-timezone",
    is_master: false,
    name: "Timezone",
  };
  const cases = [
    {
      claims: {
        company_id: user.company_id,
        company_timezone: "America/Manaus",
        exp: now / 1000 + 900,
        role: { slug: "operator" },
        user_id: user.id,
      },
      expected: "America/Manaus",
    },
    {
      claims: {
        company_id: user.company_id,
        exp: now / 1000 + 900,
        iat: "formato-em-migracao",
        timeZone: "America/Recife",
        user_id: user.id,
      },
      expected: "America/Recife",
    },
    {
      claims: {
        company_id: user.company_id,
        exp: now / 1000 + 900,
        is_master: "false",
        metadata: { timezone: "America/Fortaleza" },
        user_id: user.id,
      },
      expected: "America/Fortaleza",
    },
  ];

  for (const { claims, expected } of cases) {
    const token = accessToken(claims);
    assert.equal(
      accessTokenClaims.resolveAccessTokenContext(token, now),
      null,
      "o caso deve exercitar a extração desacoplada do contexto de acesso",
    );
    const reconciled =
      accessTokenClaims.reconcileCurrentUserWithAccessToken(user, token, now);
    assert.ok(reconciled);
    assert.equal(reconciled.company_timezone, expected);
    assert.equal(
      reconciled.role,
      undefined,
      "claims incompatíveis não podem conceder papel junto com o timezone",
    );
  }

  const foreign = accessTokenClaims.reconcileCurrentUserWithAccessToken(
    user,
    accessToken({
      company_id: "company-foreign",
      company_timezone: "Asia/Tokyo",
      exp: "formato-em-migracao",
    }),
    now,
  );
  assert.ok(foreign);
  assert.equal(
    foreign.company_timezone,
    undefined,
    "a extração operacional nunca pode atravessar para outro tenant",
  );

  for (const [profileMetadata, expected] of [
    [{ settings: { timezone: "America/Fortaleza" } }, "America/Fortaleza"],
    [{ timeZone: "America/Recife" }, "America/Recife"],
  ]) {
    const apiAuthoritative =
      accessTokenClaims.reconcileCurrentUserWithAccessToken(
        { ...user, ...profileMetadata },
        accessToken({
          company_id: user.company_id,
          company_timezone: "America/Manaus",
          exp: now / 1000 + 900,
          role: "operator",
          user_id: user.id,
        }),
        now,
      );
    assert.ok(apiAuthoritative);
    assert.equal(
      apiAuthoritative.company_timezone,
      expected,
      "timezone explícito de /auth/me deve vencer o complemento do JWT",
    );
  }
});

test("login sem cache persiste o timezone JWT para a rotação do mesmo tenant", () => {
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);
  const companyId = "company-cold-login";
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    const authenticated =
      accessTokenClaims.reconcileCurrentUserWithAccessToken(
        {
          company_id: companyId,
          email: "cold@example.com",
          id: "user-cold-login",
          is_master: false,
          name: "Cold login",
        },
        accessToken({
          company_id: companyId,
          company_timezone: "America/Manaus",
          exp: now / 1000 + 900,
          role: { slug: "operator-em-migracao" },
          user_id: "user-cold-login",
        }),
        now,
      );
    assert.ok(authenticated);
    const cacheRecord =
      companyCache.buildCurrentUserCompanyCacheRecord(authenticated);
    assert.deepEqual(cacheRecord, {
      id: companyId,
      name: companyId,
      timezone: "America/Manaus",
      trade_name: null,
    });
    companyCache.writeCompanyCache([cacheRecord]);

    const rotatedProfile = {
      company_id: companyId,
      email: authenticated.email,
      id: authenticated.id,
      is_master: false,
      name: authenticated.name,
    };
    assert.deepEqual(
      masterCompanyScope.getCompanyTimeZoneResolutionForScope(
        rotatedProfile,
        companyId,
      ),
      {
        fallback: false,
        source: "company-cache",
        timeZone: "America/Manaus",
      },
      "refresh que omite timezone deve reutilizar só a certificação do mesmo tenant",
    );
    assert.equal(
      masterCompanyScope.getCompanyTimeZoneResolutionForScope(
        rotatedProfile,
        "company-foreign",
      ).fallback,
      true,
      "o cache certificado não pode atravessar para outra empresa",
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("refresh atrasado da conta anterior aborta sem replay no novo tenant", async () => {
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
    await assert.rejects(
      oldRequest,
      (error) => error instanceof api.ApiError && error.status === 409,
    );

    assert.equal(storage.getItem("access_token"), "access-company-new");
    assert.equal(storage.getItem("refresh_token"), "refresh-company-new");
    assert.deepEqual(
      workerAuthorization,
      [],
      "a chamada antiga não pode ser retransmitida com o token vencedor",
    );

    await api.apiFetch("/workers");
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

test("mutações aguardando refresh antigo nunca são enviadas pela sessão vencedora", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    for (const method of ["POST", "PUT"]) {
      const suffix = method.toLowerCase();
      const mutationRequests = [];
      const refreshBodies = [];
      let markRefreshStarted;
      let resolveOldRefresh;
      const refreshStarted = new Promise((resolve) => {
        markRefreshStarted = resolve;
      });
      const oldRefreshResponse = new Promise((resolve) => {
        resolveOldRefresh = resolve;
      });

      globalThis.fetch = async (url, init = {}) => {
        const path = String(url);
        if (path.endsWith("/auth/refresh")) {
          refreshBodies.push(JSON.parse(String(init.body)));
          markRefreshStarted();
          return oldRefreshResponse;
        }
        if (path.endsWith("/auth/login")) {
          return jsonResponse({
            access_token: `access-winning-${suffix}`,
            expires_in: 900,
            refresh_token: `refresh-winning-${suffix}`,
            token_type: "Bearer",
          });
        }
        if (path.endsWith(`/mutation-${suffix}`)) {
          mutationRequests.push({
            authorization: new Headers(init.headers).get("Authorization"),
            method: init.method,
          });
          return jsonResponse({ ok: true });
        }
        throw new Error(`Requisição inesperada: ${path}`);
      };

      api.clearStoredSession();
      api.setStoredSession({
        access_token: `access-expiring-${suffix}`,
        expires_in: 1,
        refresh_token: `refresh-expiring-${suffix}`,
        token_type: "Bearer",
      });
      const mutation = api.apiFetch(`/mutation-${suffix}`, {
        body: { source: suffix },
        method,
      });
      await refreshStarted;
      await api.loginRequest(`winning-${suffix}@example.com`, "password");
      resolveOldRefresh(
        jsonResponse({
          access_token: `access-late-${suffix}`,
          expires_in: 900,
          refresh_token: `refresh-late-${suffix}`,
          token_type: "Bearer",
        }),
      );

      await assert.rejects(
        mutation,
        (error) => error instanceof api.ApiError && error.status === 409,
      );
      assert.deepEqual(refreshBodies, [
        { refresh_token: `refresh-expiring-${suffix}` },
      ]);
      assert.deepEqual(
        mutationRequests,
        [],
        `${method} de A não pode ser enviado com Bearer B`,
      );
      assert.equal(
        api.getStoredSession()?.access_token,
        `access-winning-${suffix}`,
      );
      assert.equal(
        api.getStoredSession()?.refresh_token,
        `refresh-winning-${suffix}`,
      );
    }
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("payload antigo é descartado quando a sessão muda durante response json", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  let markBodyStarted;
  let resolveBody;
  const bodyStarted = new Promise((resolve) => {
    markBodyStarted = resolve;
  });
  const pendingBody = new Promise((resolve) => {
    resolveBody = resolve;
  });
  const authorizations = [];

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (_url, init = {}) => {
    authorizations.push(new Headers(init.headers).get("Authorization"));
    return {
      headers: new Headers({ "content-type": "application/json" }),
      json() {
        markBodyStarted();
        return pendingBody;
      },
      ok: true,
      status: 200,
    };
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: "access-stream-a",
      expires_in: 900,
      refresh_token: "refresh-stream-a",
      token_type: "Bearer",
    });
    const request = api.apiFetch("/streamed-payload");
    await bodyStarted;

    api.setStoredSession({
      access_token: "access-stream-b",
      expires_in: 900,
      refresh_token: "refresh-stream-b",
      token_type: "Bearer",
    });
    resolveBody({ owner: "session-a", secret: "payload-a" });

    await assert.rejects(
      request,
      (error) => error instanceof api.ApiError && error.status === 409,
    );
    assert.deepEqual(authorizations, ["Bearer access-stream-a"]);
    assert.equal(api.getStoredSession()?.access_token, "access-stream-b");
    assert.equal(api.getStoredSession()?.refresh_token, "refresh-stream-b");
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("current user concorrente para a mesma sessão compartilha um único GET", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  let markProfileStarted;
  let releaseProfile;
  let profileRequests = 0;
  const profileStarted = new Promise((resolve) => {
    markProfileStarted = resolve;
  });
  const profileGate = new Promise((resolve) => {
    releaseProfile = resolve;
  });
  const profile = {
    company_id: "company-single-flight",
    email: "single-flight@example.com",
    id: "user-single-flight",
    is_master: false,
    name: "Single flight",
  };

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/auth\/me$/);
    profileRequests += 1;
    markProfileStarted();
    await profileGate;
    return jsonResponse(profile);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: "access-single-flight",
      expires_in: 900,
      refresh_token: "refresh-single-flight",
      token_type: "Bearer",
    });

    const first = api.currentUserRequest();
    const second = api.currentUserRequest();
    const third = api.currentUserRequest();
    await profileStarted;
    assert.equal(profileRequests, 1);

    releaseProfile();
    const responses = await Promise.all([first, second, third]);
    assert.equal(profileRequests, 1);
    for (const response of responses) {
      assert.equal(response.accessToken, "access-single-flight");
      assert.deepEqual(response.user, profile);
      assert.equal(api.currentUserSessionIsCurrent(response), true);
    }
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("resposta tardia do POST login não sobrescreve uma tentativa mais recente", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  let markLoginAStarted;
  let resolveLoginA;
  const loginAStarted = new Promise((resolve) => {
    markLoginAStarted = resolve;
  });
  const loginAResponse = new Promise((resolve) => {
    resolveLoginA = resolve;
  });

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (!path.endsWith("/auth/login")) {
      throw new Error(`Requisição inesperada: ${path}`);
    }
    const body = JSON.parse(String(init.body));
    if (body.email === "login-a@example.com") {
      markLoginAStarted();
      return loginAResponse;
    }
    if (body.email === "login-b@example.com") {
      return jsonResponse({
        access_token: "access-login-b",
        expires_in: 900,
        refresh_token: "refresh-login-b",
        token_type: "Bearer",
      });
    }
    throw new Error(`Login inesperado: ${body.email}`);
  };

  try {
    api.clearStoredSession();
    const loginA = api.loginRequest("login-a@example.com", "password-a");
    await loginAStarted;
    const loginB = await api.loginRequest("login-b@example.com", "password-b");
    assert.equal(loginB.access_token, "access-login-b");
    assert.equal(api.getStoredSession()?.access_token, "access-login-b");

    resolveLoginA(
      jsonResponse({
        access_token: "access-login-a",
        expires_in: 900,
        refresh_token: "refresh-login-a",
        token_type: "Bearer",
      }),
    );
    await assert.rejects(loginA, /substituída por uma tentativa mais recente/);

    assert.equal(api.getStoredSession()?.access_token, "access-login-b");
    assert.equal(api.getStoredSession()?.refresh_token, "refresh-login-b");
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("login válido vence resposta concorrente e a identificação antiga converge para a sessão atual", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const oldToken = accessToken({
    company_id: "company-old",
    company_timezone: "America/Manaus",
    exp: nowSeconds + 900,
    role: "operator",
    sub: "user-old",
  });
  const validToken = accessToken({
    company_id: "company-valid",
    company_timezone: "America/Fortaleza",
    exp: nowSeconds + 900,
    role: "operator",
    sub: "user-valid",
  });
  let markOldProfileStarted;
  let resolveOldProfile;
  const profileAuthorizations = [];
  const oldProfileStarted = new Promise((resolve) => {
    markOldProfileStarted = resolve;
  });
  const oldProfileResponse = new Promise((resolve) => {
    resolveOldProfile = resolve;
  });

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path.endsWith("/auth/login")) {
      const body = JSON.parse(String(init.body));
      const token = body.email === "old@example.com" ? oldToken : validToken;
      return jsonResponse({
        access_token: token,
        expires_in: 900,
        refresh_token:
          body.email === "old@example.com" ? "refresh-old" : "refresh-valid",
        token_type: "Bearer",
      });
    }
    if (path.endsWith("/auth/me")) {
      const authorization = new Headers(init.headers).get("Authorization");
      profileAuthorizations.push(authorization);
      if (authorization === `Bearer ${oldToken}`) {
        markOldProfileStarted();
        return oldProfileResponse;
      }
      if (authorization === `Bearer ${validToken}`) {
        return jsonResponse({
          company_id: "company-valid",
          email: "valid@example.com",
          id: "user-valid",
          is_master: false,
          name: "Valid",
        });
      }
    }
    throw new Error(`Requisição inesperada: ${path}`);
  };

  try {
    api.clearStoredSession();
    const oldAttempt = authenticate("old@example.com");
    await oldProfileStarted;
    const validUser = await authenticate("valid@example.com");
    resolveOldProfile(
      jsonResponse({
        company_id: "company-old",
        email: "old@example.com",
        id: "user-old",
        is_master: false,
        name: "Old",
      }),
    );

    const supersededUser = await oldAttempt;
    assert.equal(validUser.id, "user-valid");
    assert.equal(
      supersededUser.id,
      "user-valid",
      "a resposta antiga deve ser descartada e repetida contra a sessão vencedora",
    );
    assert.deepEqual(profileAuthorizations, [
      `Bearer ${oldToken}`,
      `Bearer ${validToken}`,
      `Bearer ${validToken}`,
    ]);
    assert.equal(api.getStoredSession()?.access_token, validToken);
    assert.equal(api.getStoredSession()?.refresh_token, "refresh-valid");
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  async function authenticate(email) {
    await api.loginRequest(email, "password");
    const sessionResponse = await api.currentUserRequest();
    const user = accessTokenClaims.reconcileCurrentUserWithAccessToken(
      sessionResponse.user,
      sessionResponse.accessToken,
    );
    assert.equal(api.currentUserSessionIsCurrent(sessionResponse), true);
    assert.ok(user);
    return user;
  }
});

test("403 atrasado de auth me é descartado e repetido sem apagar a sessão vencedora", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const supersededToken = accessToken({
    company_id: "company-superseded",
    exp: nowSeconds + 900,
    role: "operator",
    sub: "user-superseded",
  });
  const winningToken = accessToken({
    company_id: "company-winning",
    exp: nowSeconds + 900,
    role: "operator",
    sub: "user-winning",
  });
  const authorizations = [];
  const events = [];
  let markSupersededRequestStarted;
  let resolveSupersededResponse;
  const supersededRequestStarted = new Promise((resolve) => {
    markSupersededRequestStarted = resolve;
  });
  const supersededResponse = new Promise((resolve) => {
    resolveSupersededResponse = resolve;
  });

  globalThis.window = {
    dispatchEvent(event) {
      events.push(event.type);
    },
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (!path.endsWith("/auth/me")) {
      throw new Error(`Requisição inesperada: ${path}`);
    }
    const authorization = new Headers(init.headers).get("Authorization");
    authorizations.push(authorization);
    if (authorization === `Bearer ${supersededToken}`) {
      markSupersededRequestStarted();
      return supersededResponse;
    }
    if (authorization === `Bearer ${winningToken}`) {
      return jsonResponse({
        company_id: "company-winning",
        email: "winning@example.com",
        id: "user-winning",
        is_master: false,
        name: "Winning",
      });
    }
    throw new Error(`Authorization inesperado: ${authorization}`);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: supersededToken,
      expires_in: 900,
      refresh_token: "refresh-superseded",
      token_type: "Bearer",
    });
    const supersededRequest = api.currentUserRequest();
    await supersededRequestStarted;

    api.setStoredSession({
      access_token: winningToken,
      expires_in: 900,
      refresh_token: "refresh-winning",
      token_type: "Bearer",
    });
    const winningResponse = await api.currentUserRequest();
    resolveSupersededResponse(jsonResponse({ detail: "forbidden" }, 403));
    const retriedResponse = await supersededRequest;

    assert.equal(winningResponse.user.id, "user-winning");
    assert.equal(retriedResponse.user.id, "user-winning");
    assert.equal(retriedResponse.accessToken, winningToken);
    assert.equal(api.currentUserSessionIsCurrent(retriedResponse), true);
    assert.deepEqual(authorizations, [
      `Bearer ${supersededToken}`,
      `Bearer ${winningToken}`,
      `Bearer ${winningToken}`,
    ]);
    assert.equal(api.getStoredSession()?.access_token, winningToken);
    assert.equal(api.getStoredSession()?.refresh_token, "refresh-winning");
    assert.equal(
      events.includes(api.SESSION_EXPIRED_EVENT),
      false,
      "403 do snapshot obsoleto não pode expirar a sessão vencedora",
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("403 atual de auth me encerra somente a própria sessão", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const events = [];
  const requests = [];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rejectedToken = accessToken({
    company_id: "company-current-403",
    exp: nowSeconds + 900,
    role: "operator",
    user_id: "user-current-403",
  });

  globalThis.window = {
    dispatchEvent(event) {
      events.push(event.type);
    },
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    requests.push(path);
    assert.match(path, /\/auth\/me$/);
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      `Bearer ${rejectedToken}`,
    );
    return jsonResponse({ detail: "forbidden" }, 403);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: rejectedToken,
      expires_in: 900,
      refresh_token: "refresh-current-403",
      token_type: "Bearer",
    });

    await assert.rejects(
      () => api.currentUserRequest(),
      (error) => error instanceof api.ApiError && error.status === 403,
    );

    assert.equal(requests.length, 1, "403 de auth me não deve tentar refresh");
    assert.equal(api.getStoredSession(), null);
    assert.equal(
      events.filter((type) => type === api.SESSION_EXPIRED_EVENT).length,
      1,
      "a rejeição autoritativa da sessão atual deve notificar expiração uma vez",
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("401 atrasado da sessão substituída repete auth me sem renovar a sessão vencedora", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const supersededToken = accessToken({
    company_id: "company-old-401",
    exp: nowSeconds + 900,
    role: "operator",
    sub: "user-old-401",
  });
  const winningToken = accessToken({
    company_id: "company-winning-401",
    exp: nowSeconds + 900,
    role: "operator",
    sub: "user-winning-401",
  });
  const profileAuthorizations = [];
  const refreshBodies = [];
  let markSupersededRequestStarted;
  let resolveSupersededResponse;
  const supersededRequestStarted = new Promise((resolve) => {
    markSupersededRequestStarted = resolve;
  });
  const supersededResponse = new Promise((resolve) => {
    resolveSupersededResponse = resolve;
  });

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path.endsWith("/auth/me")) {
      const authorization = new Headers(init.headers).get("Authorization");
      profileAuthorizations.push(authorization);
      if (authorization === `Bearer ${supersededToken}`) {
        markSupersededRequestStarted();
        return supersededResponse;
      }
      if (authorization === `Bearer ${winningToken}`) {
        return jsonResponse({
          company_id: "company-winning-401",
          email: "winning-401@example.com",
          id: "user-winning-401",
          is_master: false,
          name: "Winning 401",
        });
      }
    }
    if (path.endsWith("/auth/refresh")) {
      refreshBodies.push(JSON.parse(String(init.body)));
      return jsonResponse({
        access_token: winningToken,
        expires_in: 900,
        refresh_token: "refresh-winning-401",
        token_type: "Bearer",
      });
    }
    throw new Error(`Requisição inesperada: ${path}`);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: supersededToken,
      expires_in: 900,
      refresh_token: "refresh-superseded-401",
      token_type: "Bearer",
    });
    const supersededRequest = api.currentUserRequest();
    await supersededRequestStarted;

    api.setStoredSession({
      access_token: winningToken,
      expires_in: 900,
      refresh_token: "refresh-winning-401",
      token_type: "Bearer",
    });
    const winningResponse = await api.currentUserRequest();
    resolveSupersededResponse(jsonResponse({ detail: "expired" }, 401));
    const retriedResponse = await supersededRequest;

    assert.equal(winningResponse.user.id, "user-winning-401");
    assert.equal(retriedResponse.user.id, "user-winning-401");
    assert.equal(retriedResponse.accessToken, winningToken);
    assert.deepEqual(
      refreshBodies,
      [],
      "um 401 autenticado com A não pode renovar usando o refresh token de B",
    );
    assert.deepEqual(profileAuthorizations, [
      `Bearer ${supersededToken}`,
      `Bearer ${winningToken}`,
      `Bearer ${winningToken}`,
    ]);
    assert.equal(api.getStoredSession()?.access_token, winningToken);
    assert.equal(
      api.getStoredSession()?.refresh_token,
      "refresh-winning-401",
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("401 atual invalida somente a própria sessão autenticada", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const events = [];
  const refreshBodies = [];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rejectedToken = accessToken({
    company_id: "company-rejected",
    exp: nowSeconds + 900,
    role: "operator",
    sub: "user-rejected",
  });

  globalThis.window = {
    dispatchEvent(event) {
      events.push(event.type);
    },
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path.endsWith("/auth/me")) {
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        `Bearer ${rejectedToken}`,
      );
      return jsonResponse({ detail: "expired" }, 401);
    }
    if (path.endsWith("/auth/refresh")) {
      refreshBodies.push(JSON.parse(String(init.body)));
      return jsonResponse({ detail: "invalid refresh" }, 401);
    }
    throw new Error(`Requisição inesperada: ${path}`);
  };

  try {
    api.clearStoredSession();
    api.setStoredSession({
      access_token: rejectedToken,
      expires_in: 900,
      refresh_token: "refresh-rejected",
      token_type: "Bearer",
    });

    await assert.rejects(
      () => api.currentUserRequest(),
      (error) => error instanceof api.ApiError && error.status === 401,
    );

    assert.deepEqual(refreshBodies, [{ refresh_token: "refresh-rejected" }]);
    assert.equal(api.getStoredSession(), null);
    assert.ok(events.includes(api.SESSION_EXPIRED_EVENT));
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("duplo envio do formulário dispara somente uma autenticação", async () => {
  const winningUser = {
    company_id: "company-valid",
    email: "valid@example.com",
    id: "user-valid",
    is_master: false,
    name: "Valid",
  };
  let resolveLogin;
  let loginCalls = 0;
  const pendingLogin = new Promise((resolve) => {
    resolveLogin = resolve;
  });
  const harness = renderLoginPageHarness({
    login() {
      loginCalls += 1;
      return pendingLogin;
    },
  });

  const firstAttempt = harness.submit();
  const blockedDuplicate = harness.submit();
  await blockedDuplicate;
  assert.equal(loginCalls, 1, "Enter + clique não podem criar dois POSTs de login");
  resolveLogin(winningUser);
  await firstAttempt;

  assert.deepEqual(harness.successToasts, ["Login realizado com sucesso"]);
  assert.deepEqual(harness.errorToasts, []);
  assert.equal(harness.stateValues[5], "", "o alerta inline deve permanecer limpo");
  assert.deepEqual(harness.routes, ["/dashboard/live"]);
});

test("logout limpa localmente antes da API e sua resposta tardia preserva novo login", async () => {
  const originalWindow = globalThis.window;
  const storage = memoryStorage({
    access_token: "access-logout-a",
    expires_at: String(Date.now() + 900_000),
    expires_in: "900",
    refresh_token: "refresh-logout-a",
    token_type: "Bearer",
  });
  let resolveLogoutResponse;
  const logoutResponse = new Promise((resolve) => {
    resolveLogoutResponse = resolve;
  });
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: storage,
    removeEventListener() {},
  };

  try {
    const harness = renderAuthProviderLogoutHarness({
      logoutResponse,
      storage,
    });
    const logout = harness.logout();

    assert.equal(storage.getItem("access_token"), null);
    assert.equal(storage.getItem("refresh_token"), null);
    assert.deepEqual(harness.routes, ["/login"]);
    assert.equal(harness.gridClearCalls, 1);
    assert.deepEqual(harness.requests, [
      {
        options: {
          auth: false,
          body: { refresh_token: "refresh-logout-a" },
          headers: { Authorization: "Bearer access-logout-a" },
          method: "POST",
        },
        path: "/auth/logout",
      },
    ]);

    storage.setItem("access_token", "access-login-b-after-logout");
    storage.setItem("refresh_token", "refresh-login-b-after-logout");
    storage.setItem("token_type", "Bearer");
    resolveLogoutResponse({});
    await logout;

    assert.equal(
      storage.getItem("access_token"),
      "access-login-b-after-logout",
    );
    assert.equal(
      storage.getItem("refresh_token"),
      "refresh-login-b-after-logout",
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("marcador multiaba remove UI antiga antes de hidratar ou encerrar a sessão externa", () => {
  const originalWindow = globalThis.window;
  const userA = {
    company_id: "company-a",
    email: "user-a@example.com",
    id: "user-a",
    is_master: false,
    name: "User A",
  };

  try {
    const switchedStorage = memoryStorage({
      access_token: "token-a",
      refresh_token: "refresh-a",
    });
    const switched = renderAuthProviderStorageHarness({
      initialUser: userA,
      storage: switchedStorage,
    });
    switchedStorage.setItem("access_token", "token-b");
    switchedStorage.setItem("refresh_token", "refresh-b");
    switched.emitSessionStorage();

    const clearGridIndex = switched.order.indexOf("clear-grid");
    const clearUserIndex = switched.order.indexOf("set-user:null");
    const hydrateBIndex = switched.order.lastIndexOf("hydrate-current-session");
    assert.ok(clearGridIndex >= 0);
    assert.ok(clearUserIndex > clearGridIndex);
    assert.ok(
      hydrateBIndex > clearUserIndex,
      "perfil e grid de A devem sumir antes do início da hidratação de B",
    );
    assert.equal(switched.stateValues[0], null);
    assert.equal(switched.stateValues[1], false);
    assert.deepEqual(switched.routes, []);
    switched.cleanup();

    const loggedOutStorage = memoryStorage({
      access_token: "token-a",
      refresh_token: "refresh-a",
    });
    const loggedOut = renderAuthProviderStorageHarness({
      initialUser: userA,
      storage: loggedOutStorage,
    });
    loggedOutStorage.removeItem("access_token");
    loggedOutStorage.removeItem("refresh_token");
    loggedOut.emitSessionStorage();

    assert.ok(loggedOut.order.includes("synchronize-external-session"));
    assert.ok(loggedOut.order.includes("clear-grid"));
    assert.equal(loggedOut.stateValues[0], null);
    assert.equal(loggedOut.stateValues[1], false);
    assert.deepEqual(loggedOut.routes, ["/login"]);
    const logoutSyncIndex = loggedOut.order.indexOf(
      "synchronize-external-session",
    );
    assert.equal(
      loggedOut.order
        .slice(logoutSyncIndex + 1)
        .includes("hydrate-current-session"),
      false,
      "logout externo não deve iniciar uma nova hidratação sem sessão",
    );
    loggedOut.cleanup();
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
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

test("master confirmado por auth me funciona com JWT sem identidade reconhecível", async () => {
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
        principal: "formato-de-identidade-ainda-desconhecido",
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

    await assert.rejects(
      () => api.apiFetch("/workers"),
      (error) => error instanceof api.ApiError && error.status === 401,
    );
    assert.deepEqual(
      requests,
      [],
      "refresh que muda de identidade deve ser rejeitado antes da operação",
    );
    assert.equal(api.getStoredSession(), null);
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

test("confirmação master sobrevive ao refresh que omite role e is_master", async () => {
  const result = await runConfirmedMasterRefreshScenario({
    currentUserId: "master-refresh-without-role",
    refreshedClaims: {
      sub: "master-refresh-without-role",
    },
    scopeId: "company-preserved-without-role",
  });

  assert.equal(result.error, null);
  assert.equal(result.refreshCalls, 1);
  assert.deepEqual(result.requests, [
    {
      path: "/api/v1/workers",
      companyId: "company-preserved-without-role",
    },
  ]);
  assert.equal(
    result.storedScope?.id,
    "company-preserved-without-role",
    "a omissão de role/is_master não deve apagar uma confirmação anterior de /auth/me",
  );
});

test("refresh preserva o principal durante migração entre sub email e user_id", async () => {
  const currentUserId = "master-migrating-identity-claims";
  const currentUserEmail = "master.migration@example.com";
  const scenarios = [
    {
      initialClaims: { sub: currentUserEmail },
      refreshedClaims: { sub: currentUserEmail, user_id: currentUserId },
    },
    {
      initialClaims: { sub: currentUserEmail, user_id: currentUserId },
      refreshedClaims: { sub: currentUserEmail },
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const scopeId = `company-identity-migration-${index}`;
    const result = await runConfirmedMasterRefreshScenario({
      currentUserEmail,
      currentUserId,
      initialClaims: scenario.initialClaims,
      refreshedClaims: scenario.refreshedClaims,
      scopeId,
    });

    assert.equal(result.error, null);
    assert.deepEqual(result.requests, [
      { path: "/api/v1/workers", companyId: scopeId },
    ]);
    assert.equal(result.storedScope?.id, scopeId);
  }
});

test("is_master false no JWT renovado remove confirmação e escopo master", async () => {
  const result = await runConfirmedMasterRefreshScenario({
    currentUserId: "master-demoted-by-boolean",
    refreshedClaims: {
      is_master: false,
      sub: "master-demoted-by-boolean",
    },
    scopeId: "company-cleared-by-boolean-demotion",
  });

  assert.equal(result.error, null);
  assert.equal(result.refreshCalls, 1);
  assert.deepEqual(result.requests, [
    {
      path: "/api/v1/workers",
      companyId: null,
    },
  ]);
  assert.equal(
    result.storedScope,
    null,
    "uma despromoção explícita deve apagar a seleção cross-tenant anterior",
  );
});

test("refresh master de outra identidade é rejeitado sem herdar empresa", async () => {
  const result = await runConfirmedMasterRefreshScenario({
    currentUserId: "master-before-identity-switch",
    refreshedClaims: {
      role: "super-admin",
      sub: "different-master-after-refresh",
    },
    scopeId: "company-must-not-cross-master-identities",
  });

  assert.ok(result.error instanceof api.ApiError);
  assert.equal(result.error.status, 401);
  assert.equal(result.refreshCalls, 1);
  assert.deepEqual(
    result.requests,
    [],
    "a operação original não pode ser enviada com o token de outra identidade",
  );
  assert.equal(result.storedSession, null);
  assert.equal(
    result.storedScope,
    null,
    "a empresa selecionada não pode sobreviver à troca de identidade",
  );
});

test("is_master false vence role super-admin conflitante no refresh", async () => {
  const result = await runConfirmedMasterRefreshScenario({
    currentUserId: "master-with-conflicting-refresh-claims",
    refreshedClaims: {
      is_master: false,
      role: "super-admin",
      sub: "master-with-conflicting-refresh-claims",
    },
    scopeId: "company-must-not-use-conflicting-master-claims",
  });

  assert.equal(result.error, null);
  assert.equal(result.refreshCalls, 1);
  assert.deepEqual(result.requests, [
    {
      path: "/api/v1/workers",
      companyId: null,
    },
  ]);
  assert.equal(
    result.storedScope,
    null,
    "claims master conflitantes não podem manter a seleção cross-tenant",
  );
});

async function runConfirmedMasterRefreshScenario({
  currentUserEmail,
  currentUserId,
  initialClaims,
  refreshedClaims,
  scopeId,
}) {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const requests = [];
  let refreshCalls = 0;

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path === "/api/v1/auth/refresh") {
      refreshCalls += 1;
      return jsonResponse({
        access_token: accessToken(refreshedClaims),
        expires_in: 900,
        refresh_token: `refresh-${currentUserId}`,
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
      access_token: accessToken(initialClaims ?? { sub: currentUserId }),
      expires_at: Date.now() + 1_000,
      expires_in: 1,
      refresh_token: `refresh-${currentUserId}`,
      token_type: "Bearer",
    });
    masterCompanyScope.setStoredMasterCompanyScope({
      id: scopeId,
      name: "Empresa selecionada antes do refresh",
    });
    api.setAuthenticatedMasterAccess({
      email: currentUserEmail ?? `${currentUserId}@example.com`,
      id: currentUserId,
      is_master: true,
      name: "Master",
    });

    let error = null;
    try {
      await api.apiFetch("/workers");
    } catch (requestError) {
      error = requestError;
    }

    return {
      error,
      refreshCalls,
      requests: [...requests],
      storedScope: masterCompanyScope.getStoredMasterCompanyScope(),
      storedSession: api.getStoredSession(),
    };
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}

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

test("usuário comum certifica timezone do JWT ou auth me somente no próprio tenant", () => {
  const originalWindow = globalThis.window;
  const storage = memoryStorage();
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);
  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };

  try {
    const jwtUser = accessTokenClaims.reconcileCurrentUserWithAccessToken(
      {
        company_id: "company-regular",
        email: "regular@example.com",
        id: "user-regular",
        is_master: false,
        name: "Regular",
      },
      accessToken({
        company_id: "company-regular",
        company_timezone: "America/Manaus",
        exp: now / 1000 + 900,
        role: "operator",
        sub: "user-regular",
      }),
      now,
    );
    assert.ok(jwtUser);
    assert.deepEqual(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(jwtUser),
      {
        fallback: false,
        source: "current-user-company",
        timeZone: "America/Manaus",
      },
      "o JWT deve completar o timezone omitido por /auth/me",
    );
    assert.equal(
      masterCompanyScope.getCompanyTimeZoneResolutionForScope(
        jwtUser,
        "company-other",
      ).fallback,
      true,
      "o timezone assinado não pode atravessar para outro tenant",
    );

    const authMeUser = accessTokenClaims.reconcileCurrentUserWithAccessToken(
      {
        company_id: "company-regular",
        company_timezone: "America/Fortaleza",
        email: "regular@example.com",
        id: "user-regular",
        is_master: false,
        name: "Regular",
      },
      accessToken({
        company_id: "company-regular",
        company_timezone: "America/Manaus",
        exp: now / 1000 + 900,
        role: "operator",
        sub: "user-regular",
      }),
      now,
    );
    assert.ok(authMeUser);
    assert.equal(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(authMeUser)
        .timeZone,
      "America/Fortaleza",
      "o timezone explícito de /auth/me deve vencer o metadado complementar do JWT",
    );

    for (const [companyClaim, expectedTimeZone] of [
      [
        {
          id: "company-nested",
          timezone: "America/Recife",
        },
        "America/Recife",
      ],
      [
        {
          id: "company-nested",
          settings: { timezone: "America/Belem" },
        },
        "America/Belem",
      ],
    ]) {
      const nestedUser = accessTokenClaims.reconcileCurrentUserWithAccessToken(
        {
          company_id: "company-nested",
          email: "nested@example.com",
          id: "user-nested",
          is_master: false,
          name: "Nested",
        },
        accessToken({
          company: companyClaim,
          exp: now / 1000 + 900,
          role: "operator",
          sub: "user-nested",
        }),
        now,
      );
      assert.ok(nestedUser);
      assert.deepEqual(
        masterCompanyScope.getEffectiveCompanyTimeZoneResolution(nestedUser),
        {
          fallback: false,
          source: "current-user-company",
          timeZone: expectedTimeZone,
        },
      );
    }

    const canonicalCompanyContext =
      accessTokenClaims.resolveAccessTokenContext(
        accessToken({
          company: {
            id: "company-nested-other",
            timezone: "America/Recife",
          },
          company_id: "company-regular",
          exp: now / 1000 + 900,
          role: "operator",
          sub: "user-regular",
          tenant_id: "tenant-related-but-not-canonical",
        }),
        now,
      );
    assert.ok(canonicalCompanyContext);
    assert.equal(
      canonicalCompanyContext.companyId,
      "company-regular",
      "company_id canônico deve vencer objetos e aliases de tenant auxiliares",
    );
    assert.equal(
      canonicalCompanyContext.timeZone,
      "",
      "timezone nested de outra empresa não pode atravessar o company_id canônico",
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

test("403 no detalhe não invalida timezone do mesmo tenant vindo de JWT, listagem ou cache", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = memoryStorage();
  const detailRequests = [];
  const now = Date.now();
  const token = accessToken({
    company_id: "company-jwt",
    company_timezone: "America/Manaus",
    exp: now / 1000 + 900,
    nbf: now / 1000 - 1,
    role: "super-admin",
    sub: "master-jwt",
  });
  const master = accessTokenClaims.reconcileCurrentUserWithAccessToken(
    {
      email: "master@example.com",
      id: "master-jwt",
      is_master: true,
      name: "Master",
    },
    token,
    now,
  );

  globalThis.window = {
    dispatchEvent() {},
    localStorage: storage,
  };
  globalThis.fetch = async (url, init = {}) => {
    detailRequests.push({
      companyId: new Headers(init.headers).get("X-Company-ID"),
      path: String(url),
    });
    return jsonResponse({ detail: "forbidden" }, 403);
  };

  try {
    assert.ok(master);
    api.clearStoredSession();
    api.setStoredSession({
      access_token: token,
      expires_in: 900,
      refresh_token: "refresh-master-timezone",
      token_type: "Bearer",
    });

    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-jwt",
      name: "Empresa JWT",
    });
    await assertCompanyDetailForbidden("company-jwt");
    assert.deepEqual(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(master),
      {
        fallback: false,
        source: "current-user-company",
        timeZone: "America/Manaus",
      },
      "o 403 não pode apagar o claim vinculado à mesma empresa",
    );

    companyCache.writeCompanyCache([
      {
        company_timezone: "America/Recife",
        id: "company-list",
        name: "Empresa da listagem",
      },
    ]);
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-list",
      name: "Empresa da listagem",
    });
    await assertCompanyDetailForbidden("company-list");
    assert.deepEqual(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(master),
      {
        fallback: false,
        source: "company-cache",
        timeZone: "America/Recife",
      },
      "o alias real da listagem deve continuar certificado após o 403",
    );

    companyCache.writeCompanyCache([
      {
        id: "company-cache",
        name: "Empresa em cache",
        tenantTimezone: "America/Fortaleza",
      },
    ]);
    companyCache.writeCompanyCache([
      {
        id: "company-cache",
        name: "Empresa parcial atualizada",
      },
    ]);
    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-cache",
      name: "Empresa parcial atualizada",
    });
    await assertCompanyDetailForbidden("company-cache");
    assert.deepEqual(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(master),
      {
        fallback: false,
        source: "company-cache",
        timeZone: "America/Fortaleza",
      },
      "uma listagem parcial e um detalhe negado não podem destruir o cache válido",
    );

    masterCompanyScope.setStoredMasterCompanyScope({
      id: "company-without-source",
      name: "Empresa sem fonte",
    });
    await assertCompanyDetailForbidden("company-without-source");
    assert.equal(
      masterCompanyScope.getEffectiveCompanyTimeZoneResolution(master).fallback,
      true,
      "o 403 não autoriza reutilizar o timezone JWT de outro tenant",
    );

    assert.deepEqual(
      detailRequests,
      [
        "company-jwt",
        "company-list",
        "company-cache",
        "company-without-source",
      ].map((companyId) => ({
        companyId: null,
        path: `/api/v1/companies/${companyId}`,
      })),
      "rotas administrativas já identificadas pelo path não devem enviar X-Company-ID",
    );
  } finally {
    api.clearStoredSession();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  async function assertCompanyDetailForbidden(companyId) {
    await assert.rejects(
      () =>
        api.apiFetch(`/companies/${companyId}`, {
          companyScopeId: companyId,
        }),
      (error) => error instanceof api.ApiError && error.status === 403,
    );
  }
});

test("worker legado herda o tenant do JWT próprio, mas não atravessa override master", () => {
  const legacyPayload = {
    workers: [
      {
        active: true,
        id: "worker-legacy",
        name: "Worker legado",
      },
    ],
  };
  const regularRows = metadataValidation.requireWorkerRows(
    legacyPayload,
    "company-jwt",
  );

  assert.equal(regularRows[0].company_id, "company-jwt");
  assert.throws(
    () => metadataValidation.requireWorkerRows(legacyPayload),
    /company_id do worker na posição 0.*inválido ou ausente/,
  );

  const foreignRows = metadataValidation.requireWorkerRows({
    workers: [
      {
        active: true,
        company_id: "company-jwt",
        id: "worker-jwt",
        name: "Worker do JWT",
      },
    ],
  });
  const crossTenantPartition = workerScope.partitionWorkersByCompanyScope(
    foreignRows,
    "company-selected",
  );

  assert.deepEqual(crossTenantPartition.scopedRows, []);
  assert.deepEqual(
    crossTenantPartition.foreignRows.map((worker) => worker.id),
    ["worker-jwt"],
  );
});

test("super-admin valida workers sem rebatizar a empresa declarada e oculta linhas estrangeiras", () => {
  const rows = metadataValidation.requireWorkerRows({
    workers: [
      {
        active: true,
        company_id: "company-selected",
        id: "worker-selected",
        name: "Worker selecionado",
      },
      {
        active: true,
        company_id: "company-jwt",
        id: "worker-jwt",
        name: "Worker do JWT",
      },
    ],
  });
  const partition = workerScope.partitionWorkersByCompanyScope(
    rows,
    "company-selected",
  );

  assert.deepEqual(
    workerScope
      .workersFromExplicitCompanyScope(partition)
      .map((worker) => worker.id),
    ["worker-selected"],
  );
  assert.equal(partition.foreignRows.length, 1);
  assert.equal(partition.foreignRows[0].company_id, "company-jwt");
});

test("super-admin publica usuários e módulos de forma independente antes dos recursos operacionais", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const administrativeSettlement = source.indexOf(
    "const [userResult, moduleResult] = await Promise.allSettled([",
  );
  const administrativePublish = source.indexOf("setUsers(nextUsers);");
  const operationalSettlement = source.indexOf(
    "workerResult,",
    administrativePublish,
  );

  assert.ok(administrativeSettlement >= 0);
  assert.ok(administrativePublish > administrativeSettlement);
  assert.ok(administrativePublish >= 0);
  assert.ok(operationalSettlement > administrativePublish);
  assert.match(
    source,
    /userResult\.status === "fulfilled"[\s\S]*?moduleResult\.status === "fulfilled"/,
  );
  assert.match(
    source,
    /setUsers\(nextUsers\);[\s\S]*?setCompanyModules\(moduleRows\);[\s\S]*?setCompanyAdministrativeIssues\(administrativeIssues\);[\s\S]*?setLoadedCompanyId\(companyId\);[\s\S]*?setLoadingDetails\(false\);/,
  );
  assert.match(
    source,
    /workerResult\.status === "fulfilled"[\s\S]*?locationResult\.status === "fulfilled"[\s\S]*?cameraResult\.status === "fulfilled"[\s\S]*?scenarioResult\.status === "fulfilled"[\s\S]*?occupancyScenarioResult\.status === "fulfilled"/,
  );
  assert.match(
    source,
    /fetchScopedWorkers\(companyScopeId: string\)[\s\S]*?apiFetch<unknown>\("\/workers", \{ companyScopeId \}\)[\s\S]*?requireWorkerRows\(value\)/,
  );
});

test("super-admin mantém a contagem de usuários certificada nos estados de carga, erro e vazio válido", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /const \[companyUsersCount, setCompanyUsersCount\] = React\.useState<number \| null>/,
  );
  assert.match(
    source,
    /foreignUserRows\.length[\s\S]*?nextUsersCount = nextUsers\.length/,
  );
  assert.match(
    source,
    /label="Usuários da empresa"[\s\S]*?loadingDetails[\s\S]*?\? "\.\.\."[\s\S]*?formatCertifiedCount\([\s\S]*?companyUsersCount/,
  );
  assert.match(
    source,
    /userAdministrativeIssue \? \([\s\S]*?Não foi possível certificar os usuários desta empresa\.[\s\S]*?: \([\s\S]*?Nenhum usuário para a empresa selecionada\./,
  );
  assert.match(source, /users: companyUsersCount,/);
  assert.doesNotMatch(
    source,
    /label="Usuários da empresa"[\s\S]{0,250}?formatNumber\(users\.length\)/,
  );
});

test("troca de empresa invalida e limpa dados antigos antes de publicar o novo escopo", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );
  const selectStart = source.indexOf(
    "const selectCompanyId = React.useCallback(",
  );
  const clearBeforeSelection = source.indexOf(
    "clearCompanyDetailsState(Boolean(nextCompanyId));",
    selectStart,
  );
  const publishSelection = source.indexOf(
    "setSelectedCompanyId(nextCompanyId);",
    selectStart,
  );

  assert.ok(selectStart >= 0);
  assert.ok(clearBeforeSelection > selectStart);
  assert.ok(publishSelection > clearBeforeSelection);
  assert.match(
    source,
    /clearCompanyDetailsState[\s\S]*?setLoadedCompanyId\(""\);[\s\S]*?setUsers\(\[\]\);[\s\S]*?setCompanyModules\(\[\]\);[\s\S]*?setWorkers\(\[\]\);/,
  );
  assert.match(
    source,
    /selectedCompanyId && loadedCompanyId === selectedCompanyId/,
  );
  assert.match(source, /hasCurrentCompanyDetails && companyStats/);
});

test("super-admin não apresenta falha operacional como contagem zero", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/super-admin-dashboard.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /type CompanyOperationalStats = \{[\s\S]*?workers: number \| null;[\s\S]*?countingScenarios: number \| null;/,
  );
  assert.match(
    source,
    /workerScopePartition\.foreignRows\.length[\s\S]*?\? null[\s\S]*?: nextWorkers\.length/,
  );
  assert.match(source, /function formatCertifiedCount[\s\S]*?"—"/);
  assert.match(source, /Dados operacionais parciais/);
  assert.match(source, /disabled = !company;/);
  assert.doesNotMatch(
    source,
    /catch \(error\) \{[\s\S]{0,500}setUsers\(\[\]\);[\s\S]{0,500}buildCompanyOperationalIssue/,
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

test("permissões fallback só atravessam com o snapshot exato da sessão atual", () => {
  const authSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  const sessionStart = authSource.indexOf(
    "async function hydrateCurrentAuthenticatedSession",
  );
  const sessionEnd = authSource.indexOf(
    "class AuthenticatedSessionChangedError",
    sessionStart,
  );
  const sessionSource = authSource.slice(sessionStart, sessionEnd);

  assert.ok(sessionStart >= 0 && sessionEnd > sessionStart);
  const exactFallback = sessionSource.indexOf("const exactFallbackUser");
  const sessionReconciliation = sessionSource.indexOf(
    "const reconciledSessionUser",
  );
  const compatibilityCheck = sessionSource.indexOf(
    "const compatibleFallbackUser",
  );
  const hydration = sessionSource.indexOf(
    "const hydratedUser = await hydrateAuthenticatedUser",
  );
  assert.ok(
    exactFallback >= 0 &&
      sessionReconciliation > exactFallback &&
      compatibilityCheck > sessionReconciliation &&
      hydration > compatibilityCheck,
    "fallback exato e /auth/me devem ser validados antes da hidratação",
  );
  assert.match(
    sessionSource.slice(exactFallback, sessionReconciliation),
    /fallbackPrincipal\s*&&[\s\S]*?fallbackPrincipal\.accessToken\s*===\s*sessionResponse\.accessToken\s*&&[\s\S]*?fallbackPrincipal\.sessionRevision\s*===\s*sessionResponse\.sessionRevision\s*&&[\s\S]*?currentUserSessionIsCurrent\(fallbackPrincipal\)[\s\S]*?\?\s*fallbackPrincipal\.user\s*:\s*null/,
    "cache anterior exige o mesmo token, revisão e sessão ainda corrente",
  );
  assert.match(
    sessionSource.slice(compatibilityCheck, hydration),
    /currentUsersShareIdentityAndCompany\(\s*exactFallbackUser,\s*reconciledSessionUser,?\s*\)[\s\S]*?\? exactFallbackUser\s*:\s*null/,
  );
  assert.match(
    sessionSource,
    /hydrateAuthenticatedUser\(\s*sessionResponse,\s*compatibleFallbackUser,?\s*\)/,
    "somente o fallback reconciliado pode alcançar a hidratação de permissões",
  );
  assert.doesNotMatch(
    sessionSource,
    /hydrateAuthenticatedUser\(\s*sessionResponse,\s*fallbackUser,?\s*\)/,
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

test("timezone do master usa catálogo e cache sem depender do detalhe da empresa", () => {
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
  const ensureEnd = superAdminSource.indexOf(
    "React.useEffect(() =>",
    ensureStart,
  );
  const ensureSource = superAdminSource.slice(ensureStart, ensureEnd);
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
  const storedHydrationStart = authSource.indexOf(
    "async function hydrateStoredMasterCompanyScope",
  );
  const storedHydrationSource = authSource.slice(storedHydrationStart);

  assert.ok(ensureStart >= 0 && ensureEnd > ensureStart);
  assert.match(
    ensureSource,
    /!currentResolution\.fallback[\s\S]*?currentResolution\.timeZone/,
    "uma resolução certificada e vinculada ao mesmo ID deve bastar para navegar",
  );
  assert.doesNotMatch(
    ensureSource,
    /currentResolution\.source\s*===/,
    "JWT, listagem, escopo salvo e cache certificados não podem ser discriminados",
  );
  assert.doesNotMatch(
    ensureSource,
    /`\/companies\/\$\{company\.id\}`/,
    "o fluxo master não pode depender do GET de detalhe que o backend nega",
  );
  assert.match(
    superAdminSource,
    /apiFetch<Company\[\]>\("\/companies"\)/,
    "a listagem global deve ser a fonte cross-tenant do superadmin",
  );
  assert.ok(
    navigationStart >= 0 &&
      certificationBeforeNavigation > navigationStart &&
      navigation > certificationBeforeNavigation,
  );
  assert.ok(storedHydrationStart >= 0);
  assert.match(
    storedHydrationSource,
    /if \(!resolution\.fallback\)/,
    "um scope salvo já certificado por JWT/listagem/cache deve ser reutilizado",
  );
  assert.doesNotMatch(
    storedHydrationSource,
    /resolution\.source\s*===/,
    "a hidratação do scope salvo deve aceitar qualquer fonte same-tenant certificada",
  );
  assert.doesNotMatch(
    storedHydrationSource,
    /`\/companies\/\$\{storedScope\.id\}`/,
    "a recarga direta do master também não pode chamar o detalhe proibido",
  );
  assert.match(
    storedHydrationSource,
    /["']\/companies["']/,
    "sem fonte local, a recarga deve consultar o catálogo global",
  );
  assert.match(apiSource, /SESSION_UPDATED_EVENT/);
  assert.match(authSource, /SESSION_UPDATED_EVENT/);
});

test("bootstrap do usuário comum nunca consulta a rota administrativa da empresa", () => {
  const authSource = readFileSync(
    resolve(projectRoot, "components/app/auth-provider.tsx"),
    "utf8",
  );
  const hydrationStart = authSource.indexOf("async function hydrateUserCompany");
  const hydrationEnd = authSource.indexOf(
    "function getDeclaredCompany",
    hydrationStart,
  );
  const hydrationSource = authSource.slice(hydrationStart, hydrationEnd);

  assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart);
  assert.match(hydrationSource, /getDeclaredCompany\(user\)/);
  assert.match(hydrationSource, /readCachedCompany\(companyId\)/);
  assert.match(hydrationSource, /mergeCurrentUserCompanies\(/);
  assert.doesNotMatch(
    hydrationSource,
    /`\/companies\/\$\{companyId\}`/,
    "o bootstrap comum não tem autorização para GET /companies/{id}",
  );
  assert.doesNotMatch(
    hydrationSource,
    /apiFetch</,
    "a empresa do usuário comum deve vir de JWT, /auth/me ou cache same-tenant",
  );
  assert.match(
    authSource,
    /reconcileCurrentUserWithAccessToken\([\s\S]*?hydrateCurrentUser\(\s*tokenEnrichedUser/,
    "o JWT precisa ser reconciliado antes da hidratação local da empresa",
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

function memoryStorage(initialValues = {}) {
  const values = new Map(
    Object.entries(initialValues).map(([key, value]) => [key, String(value)]),
  );
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

function renderLoginPageHarness({ login }) {
  const filename = resolve(projectRoot, "app/login/page.tsx");
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const stateValues = [];
  const stateWrites = [];
  const successToasts = [];
  const errorToasts = [];
  const routes = [];
  let stateIndex = 0;
  const react = {
    useEffect() {},
    useRef(initialValue) {
      return { current: initialValue };
    },
    useState(initialValue) {
      const index = stateIndex;
      stateIndex += 1;
      stateValues[index] = initialValue;
      return [
        initialValue,
        (nextValue) => {
          const value =
            typeof nextValue === "function"
              ? nextValue(stateValues[index])
              : nextValue;
          stateValues[index] = value;
          stateWrites.push({ index, value });
        },
      ];
    },
  };
  const jsxRuntime = {
    Fragment: Symbol("Fragment"),
    jsx: createTestElement,
    jsxs: createTestElement,
  };
  const iconNames = [
    "Activity",
    "AlertCircle",
    "ArrowRight",
    "BarChart3",
    "BrainCircuit",
    "Eye",
    "EyeOff",
    "LoaderCircle",
    "LockKeyhole",
    "Mail",
    "ShieldCheck",
  ];
  const iconModule = Object.fromEntries(
    iconNames.map((name) => [name, `test-icon-${name}`]),
  );
  const componentModule = (names) =>
    Object.fromEntries(names.map((name) => [name, `test-component-${name}`]));
  const modules = new Map([
    ["react", react],
    ["react/jsx-runtime", jsxRuntime],
    ["next/navigation", { useRouter: () => ({ replace: (path) => routes.push(path) }) }],
    ["lucide-react", iconModule],
    [
      "sonner",
      {
        toast: {
          error: (message) => errorToasts.push(message),
          success: (message) => successToasts.push(message),
        },
      },
    ],
    [
      "@/components/app/auth-provider",
      { useAuth: () => ({ loading: false, login, user: null }) },
    ],
    ["@/components/app/theme-provider", componentModule(["ThemeToggle"])],
    ["@/components/ui/button", componentModule(["Button"])],
    [
      "@/components/ui/card",
      componentModule(["Card", "CardContent", "CardDescription", "CardHeader"]),
    ],
    ["@/components/ui/input", componentModule(["Input"])],
    ["@/components/ui/label", componentModule(["Label"])],
    ["@/components/ui/skeleton", componentModule(["Skeleton"])],
    ["@/lib/access", { resolvePostLoginPath: async () => "/dashboard/live" }],
    [
      "@/lib/login-branding",
      {
        DEFAULT_LOGIN_BRANDING: {
          accentColor: "#0B4EA2",
          companyName: "IPXData",
          key: "default",
          logoUrl: "",
        },
        loginBrandColorWithAlpha: () => "rgb(11 78 162 / 0.28)",
        loginBrandInitials: () => "IPX",
        readableLoginBrandColor: () => "#0B4EA2",
        resolveLoginBranding: () => ({
          accentColor: "#0B4EA2",
          companyName: "IPXData",
          key: "default",
          logoUrl: "",
        }),
      },
    ],
  ]);
  const loadedModule = { exports: {} };
  const execute = new Function("exports", "require", "module", output);
  execute(loadedModule.exports, (specifier) => {
    if (!modules.has(specifier)) {
      throw new Error(`Módulo inesperado no harness de login: ${specifier}`);
    }
    return modules.get(specifier);
  }, loadedModule);
  const tree = loadedModule.exports.default();
  const form = findTestElement(tree, "form");
  assert.ok(form?.props?.onSubmit, "o formulário de login deve expor onSubmit");

  return {
    errorToasts,
    routes,
    stateValues,
    stateWrites,
    submit: () => form.props.onSubmit({ preventDefault() {} }),
    successToasts,
  };
}

function renderAuthProviderLogoutHarness({ logoutResponse, storage }) {
  const filename = resolve(projectRoot, "components/app/auth-provider.tsx");
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const requests = [];
  const routes = [];
  let gridClearCalls = 0;
  const react = {
    createContext() {
      return { Provider: "test-auth-context-provider" };
    },
    useCallback(callback) {
      return callback;
    },
    useEffect() {},
    useMemo(factory) {
      return factory();
    },
    useRef(initialValue) {
      return { current: initialValue };
    },
    useState(initialValue) {
      let value = initialValue;
      return [
        value,
        (nextValue) => {
          value =
            typeof nextValue === "function" ? nextValue(value) : nextValue;
        },
      ];
    },
  };
  const apiModule = {
    ApiError: class TestApiError extends Error {},
    apiFetch(path, options) {
      requests.push({ options, path });
      return logoutResponse;
    },
    clearStoredSession() {
      for (const key of [
        "access_token",
        "refresh_token",
        "token_type",
        "expires_in",
        "expires_at",
      ]) {
        storage.removeItem(key);
      }
    },
    currentUserSessionIsCurrent: () => true,
    currentUserRequest: async () => null,
    getStoredRefreshToken: () => storage.getItem("refresh_token") ?? "",
    getStoredSession: () => {
      const accessToken = storage.getItem("access_token");
      const refreshToken = storage.getItem("refresh_token");
      return accessToken && refreshToken
        ? { access_token: accessToken, refresh_token: refreshToken }
        : null;
    },
    loginRequest: async () => undefined,
    SESSION_EXPIRED_EVENT: "ipxdata:session-expired",
    SESSION_UPDATED_EVENT: "ipxdata:session-updated",
    setAuthenticatedMasterAccess() {},
  };
  const userGridModule = {
    clearUserGridSync() {
      gridClearCalls += 1;
    },
    hydrateUserGridFromServer: async () => false,
    startUserGridSync: () => undefined,
    USER_GRID_SYNC_STATUS_EVENT: "ipxdata:user-grid-sync-status",
  };
  const fallbackModule = new Proxy(
    {},
    {
      get: () => () => false,
    },
  );
  const modules = new Map([
    ["react", react],
    [
      "react/jsx-runtime",
      {
        Fragment: Symbol("Fragment"),
        jsx: createTestElement,
        jsxs: createTestElement,
      },
    ],
    [
      "next/navigation",
      { useRouter: () => ({ replace: (path) => routes.push(path) }) },
    ],
    ["sonner", { toast: { error() {} } }],
    ["@/lib/api", apiModule],
    ["@/lib/user-grid", userGridModule],
  ]);
  const loadedModule = { exports: {} };
  const execute = new Function("exports", "require", "module", output);
  execute(
    loadedModule.exports,
    (specifier) => modules.get(specifier) ?? fallbackModule,
    loadedModule,
  );
  const tree = loadedModule.exports.AuthProvider({ children: null });
  assert.equal(tree.type, "test-auth-context-provider");

  return {
    get gridClearCalls() {
      return gridClearCalls;
    },
    logout: tree.props.value.logout,
    requests,
    routes,
  };
}

function renderAuthProviderStorageHarness({ initialUser, storage }) {
  const filename = resolve(projectRoot, "components/app/auth-provider.tsx");
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const effects = [];
  const listeners = new Map();
  const order = [];
  const routes = [];
  const stateValues = [];
  const timers = new Map();
  let nextTimerId = 1;
  let stateIndex = 0;
  const windowMock = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
    dispatchEvent() {},
    localStorage: storage,
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    setTimeout(callback) {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
  };
  globalThis.window = windowMock;
  const react = {
    createContext() {
      return { Provider: "test-auth-context-provider" };
    },
    useCallback(callback) {
      return callback;
    },
    useEffect(effect) {
      effects.push(effect);
    },
    useMemo(factory) {
      return factory();
    },
    useRef(initialValue) {
      return { current: initialValue };
    },
    useState(initialValue) {
      const index = stateIndex;
      stateIndex += 1;
      stateValues[index] = index === 0 ? initialUser : initialValue;
      return [
        stateValues[index],
        (nextValue) => {
          const value =
            typeof nextValue === "function"
              ? nextValue(stateValues[index])
              : nextValue;
          stateValues[index] = value;
          const label = index === 0 ? "user" : index === 1 ? "manager" : "loading";
          order.push(`set-${label}:${value === null ? "null" : String(value)}`);
        },
      ];
    },
  };
  const apiModule = {
    ApiError: class TestApiError extends Error {},
    apiFetch: async () => [],
    clearStoredSession() {
      storage.removeItem("access_token");
      storage.removeItem("refresh_token");
    },
    currentUserSessionIsCurrent: () => true,
    currentUserRequest() {
      order.push("hydrate-current-session");
      return new Promise(() => undefined);
    },
    getStoredRefreshToken: () => storage.getItem("refresh_token") ?? "",
    getStoredSession: () => {
      const accessToken = storage.getItem("access_token");
      const refreshToken = storage.getItem("refresh_token");
      return accessToken && refreshToken
        ? { access_token: accessToken, refresh_token: refreshToken }
        : null;
    },
    loginRequest: async () => undefined,
    SESSION_EXPIRED_EVENT: "ipxdata:session-expired",
    SESSION_SYNC_STORAGE_KEY: "ipxdata.auth-session-sync.v1",
    SESSION_UPDATED_EVENT: "ipxdata:session-updated",
    setAuthenticatedMasterAccess() {},
    synchronizeExternalSessionUpdate() {
      order.push("synchronize-external-session");
    },
  };
  const accessTokenModule = {
    accessTokenMatchesUserIdentity: () => false,
    reconcileCurrentUserWithAccessToken(user, accessToken) {
      return user?.id === "user-a" && accessToken === "token-a" ? user : null;
    },
  };
  const userGridModule = {
    clearUserGridSync() {
      order.push("clear-grid");
    },
    hydrateUserGridFromServer: async () => false,
    startUserGridSync: () => undefined,
    USER_GRID_SYNC_STATUS_EVENT: "ipxdata:user-grid-sync-status",
  };
  const fallbackModule = new Proxy(
    {},
    {
      get: () => () => false,
    },
  );
  const modules = new Map([
    ["react", react],
    [
      "react/jsx-runtime",
      {
        Fragment: Symbol("Fragment"),
        jsx: createTestElement,
        jsxs: createTestElement,
      },
    ],
    [
      "next/navigation",
      { useRouter: () => ({ replace: (path) => routes.push(path) }) },
    ],
    ["sonner", { toast: { error() {} } }],
    ["@/lib/access-token-claims", accessTokenModule],
    ["@/lib/api", apiModule],
    ["@/lib/user-grid", userGridModule],
  ]);
  const loadedModule = { exports: {} };
  const execute = new Function("exports", "require", "module", output);
  execute(
    loadedModule.exports,
    (specifier) => modules.get(specifier) ?? fallbackModule,
    loadedModule,
  );
  const tree = loadedModule.exports.AuthProvider({ children: null });
  assert.equal(tree.type, "test-auth-context-provider");
  assert.ok(effects.length >= 2, "o provider deve registrar o efeito multiaba");
  effects[0]();
  let cleanupStorageEffect;
  for (let index = 1; index < effects.length && !listeners.has("storage"); index += 1) {
    const cleanup = effects[index]();
    if (listeners.has("storage")) cleanupStorageEffect = cleanup;
    else cleanup?.();
  }
  assert.ok(
    listeners.has("storage"),
    "o provider deve registrar o listener multiaba independentemente da ordem dos efeitos",
  );

  return {
    cleanup() {
      cleanupStorageEffect?.();
      timers.clear();
    },
    emitSessionStorage() {
      const listener = listeners.get("storage");
      assert.ok(listener, "o provider deve escutar eventos de storage");
      listener({ key: apiModule.SESSION_SYNC_STORAGE_KEY });
      while (timers.size) {
        const callbacks = Array.from(timers.values());
        timers.clear();
        callbacks.forEach((callback) => callback());
      }
    },
    order,
    routes,
    stateValues,
  };
}

function createTestElement(type, props, key) {
  return { key, props: props ?? {}, type };
}

function findTestElement(node, type) {
  if (!node || typeof node !== "object") return null;
  if (node.type === type) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findTestElement(child, type);
    if (match) return match;
  }
  return null;
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
