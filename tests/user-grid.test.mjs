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
const userGrid = loadTypeScriptModule("lib/user-grid.ts");
const userGridLocal = loadTypeScriptModule("lib/user-grid-local.ts");

test("GET do grid falhou: preferências locais nunca habilitam PUT", async () => {
  await withBrowser(
    {
      [scopedKey("ipxdata.card-views.v1", "company-a", "user-a")]:
        "local-before-failure",
    },
    async ({ requests, storage }) => {
      globalThis.fetch = async (url, init = {}) => {
        requests.push(requestRecord(url, init));
        return jsonResponse({ detail: "indisponível" }, 503);
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), false);

      storage.setItem(
        scopedKey("ipxdata.card-views.v1", "company-a", "user-a"),
        "changed-after-failure",
      );
      userGrid.requestUserGridSync();
      assert.equal(await userGrid.flushUserGridSync(), false);

      assert.deepEqual(
        requests.map((request) => request.method),
        ["GET"],
      );
    },
  );
});

test("hidratação não persiste o merge quando a sessão muda antes do PUT", async () => {
  const managedKey = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );

  await withBrowser(
    {
      access_token: "token-a",
      refresh_token: "refresh-a",
      [managedKey]: "local-session-a",
    },
    async ({ requests }) => {
      let shouldApplyChecks = 0;
      globalThis.fetch = async (url, init = {}) => {
        requests.push(requestRecord(url, init));
        return jsonResponse({ grid: gridDocument({}) });
      };

      assert.equal(
        await userGrid.hydrateUserGridFromServer("user-a", {
          expectedAccessToken: "token-a",
          shouldApply: () => {
            shouldApplyChecks += 1;
            return shouldApplyChecks < 3;
          },
        }),
        false,
      );
      assert.deepEqual(
        requests.map((request) => request.method),
        ["GET"],
        "o merge obsoleto não pode iniciar um PUT depois da troca de sessão",
      );
    },
  );
});

test("merge do grid isola usuários, preserva empresas e não exclui chaves ausentes", async () => {
  const companyAUserA = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );
  const companyBUserA = scopedKey(
    "ipxdata.occupancy-dashboard-settings.v1",
    "company-b",
    "user-a",
  );
  const occupancyAnalysisPreset = scopedKey(
    "ipxdata.widget-view-presets.v1.occupancy-analysis",
    "company-a",
    "user-a",
  );
  const dashboardFocus = `${scopedKey(
    "ipxdata.dashboard-focus.v1",
    "company-a",
    "user-a",
  )}.view.live`;
  const companyAUserB = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-b",
  );
  const legacyCompanyOnly =
    "ipxdata.live-dashboard-settings.v1.company.company-a";
  const operationalKey = "ipxdata.camera-groups.v1";
  const unsupportedPersonalKey = scopedKey(
    "ipxdata.future-preference.v1",
    "company-a",
    "user-a",
  );
  const remoteOpaqueKey = scopedKey(
    "ipxdata.future-server-preference.v1",
    "company-a",
    "user-a",
  );

  await withBrowser(
    {
      [companyAUserA]: "local-stale",
      [companyBUserA]: "local-company-b",
      [occupancyAnalysisPreset]: "analysis-preset",
      [dashboardFocus]: JSON.stringify({
        scopeMode: "scenario",
        selectedId: "scenario-a",
      }),
      [companyAUserB]: "local-user-b",
      [legacyCompanyOnly]: "legacy-company-only",
      [operationalKey]: "operational-local",
      [unsupportedPersonalKey]: "unsupported-local",
    },
    async ({ requests, storage }) => {
      let remoteGrid = gridDocument({
        [companyAUserA]: "remote-current",
        [companyAUserB]: "remote-user-b-must-stay-opaque",
        [remoteOpaqueKey]: "opaque-server-value",
      });

      globalThis.fetch = async (url, init = {}) => {
        const request = requestRecord(url, init);
        requests.push(request);
        if (request.method === "GET") {
          return jsonResponse({ grid: remoteGrid });
        }
        remoteGrid = structuredClone(request.body.grid);
        return jsonResponse({ grid: remoteGrid });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);

      assert.equal(storage.getItem(companyAUserA), "remote-current");
      assert.equal(storage.getItem(companyBUserA), "local-company-b");
      assert.equal(storage.getItem(occupancyAnalysisPreset), "analysis-preset");
      assert.equal(
        storage.getItem(dashboardFocus),
        JSON.stringify({
          scopeMode: "scenario",
          selectedId: "scenario-a",
        }),
      );
      assert.equal(storage.getItem(companyAUserB), "local-user-b");
      assert.equal(storage.getItem(legacyCompanyOnly), "legacy-company-only");
      assert.equal(storage.getItem(operationalKey), "operational-local");
      assert.equal(
        storage.getItem(unsupportedPersonalKey),
        "unsupported-local",
      );

      const hydrationPut = requests.find((request) => request.method === "PUT");
      assert.ok(hydrationPut, "o merge local seguro deve ser persistido após GET");
      assert.equal(hydrationPut.body.grid.version, 2);
      assert.equal(
        hydrationPut.body.grid.entries[companyAUserA].value,
        "remote-current",
      );
      assert.equal(
        hydrationPut.body.grid.entries[companyBUserA].value,
        "local-company-b",
      );
      assert.equal(
        hydrationPut.body.grid.entries[occupancyAnalysisPreset].value,
        "analysis-preset",
      );
      assert.equal(
        hydrationPut.body.grid.entries[dashboardFocus].value,
        JSON.stringify({
          scopeMode: "scenario",
          selectedId: "scenario-a",
        }),
      );
      assert.equal(
        hydrationPut.body.grid.entries[companyAUserB].value,
        "remote-user-b-must-stay-opaque",
      );
      assert.equal(
        hydrationPut.body.grid.entries[remoteOpaqueKey].value,
        "opaque-server-value",
      );
      assert.equal(hydrationPut.body.grid.entries[legacyCompanyOnly], undefined);
      assert.equal(hydrationPut.body.grid.entries[operationalKey], undefined);
      assert.equal(
        hydrationPut.body.grid.entries[unsupportedPersonalKey],
        undefined,
      );

      storage.setItem(companyAUserA, "local-after-hydration");
      userGrid.requestUserGridSync();
      assert.equal(await userGrid.flushUserGridSync(), true);

      const lastPut = requests.filter((request) => request.method === "PUT").at(-1);
      assert.equal(
        lastPut.body.grid.entries[companyAUserA].value,
        "local-after-hydration",
      );
      assert.equal(
        lastPut.body.grid.entries[companyBUserA].value,
        "local-company-b",
      );
      assert.equal(
        lastPut.body.grid.entries[companyAUserB].value,
        "remote-user-b-must-stay-opaque",
      );
      assert.equal(
        lastPut.body.grid.entries[remoteOpaqueKey].value,
        "opaque-server-value",
      );
    },
  );
});

test("grid legado migra somente preferências pessoais já escopadas", async () => {
  const managedKey = scopedKey(
    "ipxdata.period-analysis-settings.v1",
    "company-a",
    "user-a",
  );
  const companyOnlyKey =
    "ipxdata.period-analysis-settings.v1.company.company-a";

  await withBrowser(
    {
      [managedKey]: "personal-settings",
      [companyOnlyKey]: "legacy-shared-settings",
      "ipxdata.sidebar-collapsed.v1": "true",
    },
    async ({ requests }) => {
      const legacyGrid = { columns: ["old", "layout"] };
      let serverGrid = legacyGrid;
      globalThis.fetch = async (url, init = {}) => {
        const request = requestRecord(url, init);
        requests.push(request);
        if (request.method === "GET") {
          return jsonResponse({ grid: serverGrid });
        }
        serverGrid = structuredClone(request.body.grid);
        return jsonResponse({ grid: serverGrid });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);

      const migrationPut = requests.find((request) => request.method === "PUT");
      assert.ok(migrationPut);
      assert.deepEqual(migrationPut.body.grid.legacyGrid, legacyGrid);
      assert.deepEqual(Object.keys(migrationPut.body.grid.entries), [managedKey]);
      assert.equal(
        migrationPut.body.grid.entries[managedKey].value,
        "personal-settings",
      );
    },
  );
});

test("grid remoto recupera namespaces antigos sem sobrescrever preferência pessoal", async () => {
  const legacyCardView = "ipxdata.card-views.v1.company-a";
  const transitionalLiveSettings =
    "ipxdata.live-dashboard-settings.v1.company.company-b";
  const recoveredCardView = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );
  const recoveredLiveSettings = scopedKey(
    "ipxdata.live-dashboard-settings.v1",
    "company-b",
    "user-a",
  );
  const existingPersonal = scopedKey(
    "ipxdata.report-custom-widgets.v1",
    "company-c",
    "user-a",
  );
  const legacyWithPersonal =
    "ipxdata.report-custom-widgets.v1.company-c";

  await withBrowser(
    {
      [existingPersonal]: "local-personal-wins",
    },
    async ({ requests, storage }) => {
      let serverGrid = gridDocument({
        [legacyCardView]: "legacy-card-view",
        [legacyWithPersonal]: "legacy-report-widgets",
        [transitionalLiveSettings]: "transitional-settings",
      });
      globalThis.fetch = async (url, init = {}) => {
        const request = requestRecord(url, init);
        requests.push(request);
        if (request.method === "GET") {
          return jsonResponse({ grid: serverGrid });
        }
        serverGrid = structuredClone(request.body.grid);
        return jsonResponse({ grid: serverGrid });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);

      assert.equal(storage.getItem(recoveredCardView), "legacy-card-view");
      assert.equal(
        storage.getItem(recoveredLiveSettings),
        "transitional-settings",
      );
      assert.equal(storage.getItem(existingPersonal), "local-personal-wins");

      const migrationPut = requests.find((request) => request.method === "PUT");
      assert.ok(migrationPut, "a recuperação deve ser persistida no grid pessoal");
      assert.equal(
        migrationPut.body.grid.entries[recoveredCardView].value,
        "legacy-card-view",
      );
      assert.equal(
        migrationPut.body.grid.entries[recoveredLiveSettings].value,
        "transitional-settings",
      );
      assert.equal(
        migrationPut.body.grid.entries[existingPersonal].value,
        "local-personal-wins",
      );
      assert.equal(
        migrationPut.body.grid.entries[legacyWithPersonal].value,
        "legacy-report-widgets",
      );
      assert.equal(
        Object.keys(migrationPut.body.grid.entries).some((key) =>
          key.includes("company.company-c%2Euser%2Euser-a"),
        ),
        false,
        "uma chave pessoal atual nunca pode ser reinterpretada como legado",
      );
    },
  );
});

test("documentos v1 em JSON string e byte[] migram para v2 com metadado por entrada", async () => {
  const key = scopedKey(
    "ipxdata.dashboard-module.v1",
    "company-a",
    "user-a",
  );
  const legacy = gridDocument({ [key]: "occupancy" });
  const variants = [
    JSON.stringify(legacy),
    Array.from(new TextEncoder().encode(JSON.stringify(legacy))),
  ];

  for (const grid of variants) {
    await withBrowser({}, async ({ requests, storage }) => {
      let serverGrid = grid;
      globalThis.fetch = async (url, init = {}) => {
        const request = requestRecord(url, init);
        requests.push(request);
        if (request.method === "GET") return jsonResponse({ grid: serverGrid });
        serverGrid = structuredClone(request.body.grid);
        return jsonResponse({ grid: serverGrid });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
      assert.equal(storage.getItem(key), "occupancy");
      const put = requests.find((request) => request.method === "PUT");
      assert.ok(put, "v1 deve ser atualizado depois de um segundo GET seguro");
      assert.equal(put.body.grid.version, 2);
      assert.equal(put.body.grid.entries[key].value, "occupancy");
      assert.match(put.body.grid.entries[key].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.deepEqual(
        requests.slice(-3).map((request) => request.method),
        ["GET", "PUT", "GET"],
      );
    });
  }
});

test("remoção vira tombstone e uma cópia local antiga não ressuscita a preferência", async () => {
  const key = scopedKey(
    "ipxdata.live-dashboard-settings.v1",
    "company-a",
    "user-a",
  );
  let remoteGrid = gridDocumentV2({
    [key]: valueEntry("remote-value", "2026-08-20T10:00:00.000Z"),
  });

  await withBrowser({}, async ({ requests, storage, windowTarget }) => {
    globalThis.fetch = async (url, init = {}) => {
      const request = requestRecord(url, init);
      requests.push(request);
      if (request.method === "GET") return jsonResponse({ grid: remoteGrid });
      remoteGrid = structuredClone(request.body.grid);
      return jsonResponse({ grid: remoteGrid });
    };

    assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
    assert.equal(storage.getItem(key), "remote-value");

    assert.equal(userGrid.removeUserGridPreference(key), true);
    userGrid.requestUserGridSync();
    assert.equal(await userGrid.flushUserGridSync(), true);

    const tombstone = remoteGrid.entries[key];
    assert.equal(tombstone.deleted, true);
    assert.equal("value" in tombstone, false);
    assert.match(tombstone.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    userGrid.clearUserGridSync();
    storage.setItem(key, "stale-browser-copy");
    assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
    assert.equal(storage.getItem(key), null);
    assert.equal(remoteGrid.entries[key].deleted, true);

    const stop = userGrid.startUserGridSync("user-a");
    remoteGrid = gridDocumentV2({
      [key]: valueEntry("recreated-remotely", "2099-01-01T00:00:00.000Z"),
    });
    windowTarget.dispatchEvent(new Event("focus"));
    await waitFor(() => storage.getItem(key) === "recreated-remotely");
    stop();
  });
});

test("PUT relê e mescla por entrada: pendência local vence e desconhecidos remotos sobrevivem", async () => {
  const key = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );
  const unsupportedLocal = scopedKey(
    "ipxdata.future-preference.v99",
    "company-a",
    "user-a",
  );
  const concurrentKey = "server.future.entry";
  let remoteGrid = gridDocumentV2({
    [key]: valueEntry("initial", "2026-08-20T10:00:00.000Z"),
  });

  await withBrowser(
    {
      access_token: "sensitive-token",
      [unsupportedLocal]: "must-stay-local",
    },
    async ({ requests, storage }) => {
      globalThis.fetch = async (url, init = {}) => {
        const request = requestRecord(url, init);
        requests.push(request);
        if (request.method === "GET") return jsonResponse({ grid: remoteGrid });
        remoteGrid = structuredClone(request.body.grid);
        return jsonResponse({ grid: remoteGrid });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
      storage.setItem(key, "local-pending");
      userGrid.requestUserGridSync();

      // Simula outra sessão gravando entre a hidratação e o flush local.
      remoteGrid = gridDocumentV2({
        [key]: valueEntry("remote-concurrent", "2099-01-01T00:00:00.000Z"),
        [concurrentKey]: { payload: { layout: "future" }, schema: 9 },
      });
      assert.equal(await userGrid.flushUserGridSync(), true);

      assert.deepEqual(
        requests.map((request) => request.method),
        ["GET", "GET", "PUT", "GET"],
      );
      const put = requests.findLast((request) => request.method === "PUT").body.grid;
      assert.equal(put.entries[key].value, "local-pending");
      assert.ok(
        Date.parse(put.entries[key].updatedAt) > Date.parse("2099-01-01T00:00:00.000Z"),
        "a pendência local recebe relógio lógico posterior à base remota",
      );
      assert.deepEqual(put.entries[concurrentKey], {
        payload: { layout: "future" },
        schema: 9,
      });
      assert.equal(put.entries[unsupportedLocal], undefined);
      assert.equal(put.entries.access_token, undefined);
      assert.equal(storage.getItem(unsupportedLocal), "must-stay-local");
    },
  );
});

test("reconciliação converge após overwrite concorrente e desempata timestamps iguais", async () => {
  const key = scopedKey(
    "ipxdata.dashboard-focus.v1",
    "company-a",
    "user-a",
  );
  const tiedAt = "2026-08-20T10:00:00.000Z";
  let remoteGrid = gridDocumentV2({
    [key]: valueEntry("alpha", tiedAt),
  });

  await withBrowser({}, async ({ requests, storage, windowTarget }) => {
    globalThis.fetch = async (url, init = {}) => {
      const request = requestRecord(url, init);
      requests.push(request);
      if (request.method === "GET") return jsonResponse({ grid: remoteGrid });
      remoteGrid = structuredClone(request.body.grid);
      return jsonResponse({ grid: remoteGrid });
    };

    assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
    const stop = userGrid.startUserGridSync("user-a");

    remoteGrid = gridDocumentV2({
      [key]: valueEntry("zeta", tiedAt),
    });
    windowTarget.dispatchEvent(new Event("focus"));
    await waitFor(() => storage.getItem(key) === "zeta");

    // O mesmo conflito visto na direção oposta escolhe o mesmo JSON estável.
    remoteGrid = gridDocumentV2({
      [key]: valueEntry("alpha", tiedAt),
      "server.concurrent.opaque": { schema: 7 },
    });
    const getCountBefore = requests.filter((request) => request.method === "GET").length;
    windowTarget.dispatchEvent(new Event("focus"));
    await waitFor(
      () => requests.filter((request) => request.method === "GET").length > getCountBefore,
    );
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    assert.equal(storage.getItem(key), "zeta");

    assert.equal(await userGrid.flushUserGridSync(), true);
    assert.equal(remoteGrid.entries[key].value, "zeta");
    assert.deepEqual(remoteGrid.entries["server.concurrent.opaque"], {
      schema: 7,
    });
    assert.deepEqual(
      requests.slice(-3).map((request) => request.method),
      ["GET", "PUT", "GET"],
    );
    stop();
  });
});

test("documento futuro não suportado e chaves fora da allowlist nunca são enviados", async () => {
  const managedKey = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );
  const unsupportedKey = scopedKey(
    "ipxdata.future-preference.v3",
    "company-a",
    "user-a",
  );

  await withBrowser(
    {
      access_token: "jwt-secret",
      refresh_token: "refresh-secret",
      [managedKey]: "local-safe",
      [unsupportedKey]: "future-local",
    },
    async ({ requests, storage }) => {
      globalThis.fetch = async (url, init = {}) => {
        requests.push(requestRecord(url, init));
        return jsonResponse({
          grid: {
            entries: { "future.server": { value: "opaque" } },
            format: "ipxdata-user-grid",
            updatedAt: "2026-08-20T10:00:00.000Z",
            version: 3,
          },
        });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), false);
      storage.setItem(managedKey, "changed-but-unsafe-base");
      userGrid.requestUserGridSync();
      assert.equal(await userGrid.flushUserGridSync(), false);
      assert.deepEqual(requests.map((request) => request.method), ["GET"]);
      assert.equal(storage.getItem(unsupportedKey), "future-local");
      assert.equal(storage.getItem("access_token"), "jwt-secret");
    },
  );
});

test("identificador de usuário com ponto permanece isolado e codificado", async () => {
  const userId = "user.name@example.com";
  const key = scopedKey("ipxdata-theme", "", userId);
  const otherUserKey = scopedKey("ipxdata-theme", "", "user");
  let remoteGrid = gridDocumentV2({
    [key]: valueEntry("dark", "2026-08-20T10:00:00.000Z"),
    [otherUserKey]: valueEntry("light", "2026-08-20T10:00:00.000Z"),
  });

  await withBrowser(
    { [otherUserKey]: "local-other-user" },
    async ({ requests, storage }) => {
      globalThis.fetch = async (url, init = {}) => {
        const request = requestRecord(url, init);
        requests.push(request);
        if (request.method === "GET") return jsonResponse({ grid: remoteGrid });
        remoteGrid = structuredClone(request.body.grid);
        return jsonResponse({ grid: remoteGrid });
      };

      assert.match(key, /user\.user%2Ename%40example%2Ecom$/);
      assert.equal(await userGrid.hydrateUserGridFromServer(userId), true);
      assert.equal(storage.getItem(key), "dark");
      assert.equal(storage.getItem(otherUserKey), "local-other-user");

      storage.setItem(key, "cyber");
      userGrid.requestUserGridSync();
      assert.equal(await userGrid.flushUserGridSync(), true);
      assert.equal(remoteGrid.entries[key].value, "cyber");
      assert.equal(remoteGrid.entries[otherUserKey].value, "light");
    },
  );
});

test("GET inicial falho reintenta com backoff e eventos online/focus reconciliam", async () => {
  const key = scopedKey(
    "ipxdata.sidebar-collapsed.v1",
    "",
    "user-a",
  );
  let attempt = 0;
  let remoteGrid = gridDocumentV2({
    [key]: valueEntry("true", "2026-08-20T10:00:00.000Z"),
  });

  await withBrowser({}, async ({ requests, storage, timeoutDelays, windowTarget }) => {
    const storageEvents = [];
    windowTarget.addEventListener("storage", (event) => {
      storageEvents.push({ key: event.key, newValue: event.newValue });
    });
    globalThis.fetch = async (url, init = {}) => {
      const request = requestRecord(url, init);
      requests.push(request);
      attempt += 1;
      if (attempt === 1) return jsonResponse({ detail: "offline" }, 503);
      return jsonResponse({ grid: remoteGrid });
    };

    const stop = userGrid.startUserGridSync("user-a");
    assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), false);
    assert.ok(timeoutDelays.includes(1_000), "primeiro retry usa backoff de 1s");

    windowTarget.dispatchEvent(new Event("online"));
    await waitFor(() => storage.getItem(key) === "true");
    assert.equal(requests.filter((request) => request.method === "GET").length, 2);

    remoteGrid = gridDocumentV2({
      [key]: valueEntry("false", "2026-08-21T10:00:00.000Z"),
    });
    windowTarget.dispatchEvent(new Event("focus"));
    await waitFor(() => storage.getItem(key) === "false");
    assert.equal(requests.filter((request) => request.method === "GET").length, 3);
    assert.deepEqual(
      storageEvents.filter((event) => event.key === key).map((event) => event.newValue),
      ["true", "false"],
    );
    stop();
  });
});

test("outbox durável preserva escrita e remoção ao reiniciar antes do debounce", async () => {
  const key = scopedKey(
    "ipxdata.live-dashboard-settings.v1",
    "company-a",
    "user-a",
  );

  await withBrowser({}, async ({ requests, storage }) => {
    let serverGrid = gridDocumentV2({
      [key]: valueEntry("remote-old", "2026-08-20T10:00:00.000Z"),
    });
    globalThis.fetch = async (url, init = {}) => {
      const request = requestRecord(url, init);
      requests.push(request);
      if (request.method === "PUT") serverGrid = request.body.grid;
      return jsonResponse({ grid: serverGrid });
    };

    assert.equal(userGrid.writeUserGridPreference(key, "local-new"), true);
    assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
    assert.equal(storage.getItem(key), "local-new");
    assert.equal(serverGrid.entries[key].value, "local-new");
    assert.equal(
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .some((storageKey) => storageKey?.startsWith("ipxdata.user-grid-outbox.v1.")),
      false,
      "a confirmação remota deve reconhecer a escrita do outbox",
    );

    userGrid.clearUserGridSync();
    assert.equal(userGrid.removeUserGridPreference(key), true);
    assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
    assert.equal(storage.getItem(key), null);
    assert.equal(serverGrid.entries[key].deleted, true);
    assert.ok(
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .some((storageKey) =>
          storageKey?.startsWith("ipxdata.user-grid-known-deletion.v1."),
        ),
      "a exclusão confirmada deve impedir que um fallback legado ressuscite",
    );
  });
});

test("entrada v2 gerenciada malformada é quarentenada e reparada", async () => {
  const key = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );

  await withBrowser({ [key]: "local-safe" }, async ({ requests, storage }) => {
    let serverGrid = gridDocumentV2({
      [key]: { payload: "formato-inválido" },
    });
    globalThis.fetch = async (url, init = {}) => {
      const request = requestRecord(url, init);
      requests.push(request);
      if (request.method === "PUT") serverGrid = request.body.grid;
      return jsonResponse({ grid: serverGrid });
    };

    assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);
    assert.equal(storage.getItem(key), "local-safe");
    assert.equal(serverGrid.entries[key].value, "local-safe");
    assert.deepEqual(serverGrid.quarantinedEntries[key], {
      payload: "formato-inválido",
    });
    assert.ok(requests.some((request) => request.method === "PUT"));
  });
});

test("preferência global legada é reivindicada por um único usuário", async () => {
  await withBrowser({ "ipxdata-theme": "dark" }, async ({ storage }) => {
    assert.equal(
      userGridLocal.claimLegacyUserGridPreference("ipxdata-theme", "user-a"),
      "dark",
    );
    storage.setItem("ipxdata-theme", "light");
    assert.equal(
      userGridLocal.claimLegacyUserGridPreference("ipxdata-theme", "user-b"),
      null,
      "o cache de boot do usuário anterior não pode virar preferência do próximo",
    );
    assert.equal(
      userGridLocal.claimLegacyUserGridPreference("ipxdata-theme", "user-a"),
      "light",
    );
  });
});

async function withBrowser(initialStorage, run) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousCustomEvent = globalThis.CustomEvent;
  const previousStorageEvent = globalThis.StorageEvent;
  const storage = memoryStorage(initialStorage);
  const requests = [];
  const timeoutDelays = [];
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();

  globalThis.CustomEvent = class TestCustomEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.detail = init.detail;
    }
  };
  globalThis.StorageEvent = class TestStorageEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      Object.assign(this, init);
    }
  };
  globalThis.window = {
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    clearInterval,
    clearTimeout,
    dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
    localStorage: storage,
    removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    setInterval,
    setTimeout(callback, delay, ...args) {
      timeoutDelays.push(delay);
      return setTimeout(callback, delay, ...args);
    },
  };
  globalThis.document = {
    addEventListener: documentTarget.addEventListener.bind(documentTarget),
    removeEventListener: documentTarget.removeEventListener.bind(documentTarget),
    visibilityState: "visible",
  };

  try {
    await run({ requests, storage, timeoutDelays, windowTarget });
  } finally {
    userGrid.clearUserGridSync();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    globalThis.CustomEvent = previousCustomEvent;
    globalThis.StorageEvent = previousStorageEvent;
  }
}

function scopedKey(baseKey, companyId, userId) {
  const companyScope = companyId
    ? `.company.${encodeSegment(companyId)}`
    : "";
  return `${baseKey}${companyScope}.user.${encodeSegment(userId)}`;
}

function encodeSegment(value) {
  return encodeURIComponent(value.trim()).replace(/\./g, "%2E");
}

function gridDocument(entries) {
  return {
    entries,
    format: "ipxdata-user-grid",
    updatedAt: "2026-08-11T12:00:00.000Z",
    version: 1,
  };
}

function gridDocumentV2(entries, extras = {}) {
  return {
    ...extras,
    entries,
    format: "ipxdata-user-grid",
    updatedAt: "2026-08-20T10:00:00.000Z",
    version: 2,
  };
}

function valueEntry(value, updatedAt) {
  return { updatedAt, value };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("timeout aguardando sincronização do user-grid");
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  }
}

function requestRecord(url, init) {
  return {
    body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    method: init.method ?? "GET",
    url: String(url),
  };
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
    get length() {
      return values.size;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
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
