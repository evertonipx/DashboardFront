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

test("resposta tardia do grid não aplica nem persiste após troca de sessão", async () => {
  const managedKey = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );
  const remoteOnlyKey = scopedKey(
    "ipxdata.live-dashboard-settings.v1",
    "company-a",
    "user-a",
  );

  await withBrowser(
    {
      access_token: "token-a",
      refresh_token: "refresh-a",
      [managedKey]: "local-session-a",
    },
    async ({ requests, storage }) => {
      const events = [];
      let sessionIsCurrent = true;
      let markGetStarted;
      let resolveGridResponse;
      const getStarted = new Promise((resolve) => {
        markGetStarted = resolve;
      });
      const pendingGridResponse = new Promise((resolve) => {
        resolveGridResponse = resolve;
      });
      globalThis.window.dispatchEvent = (event) => {
        events.push({ detail: event.detail, type: event.type });
        return true;
      };
      globalThis.fetch = async (url, init = {}) => {
        requests.push(requestRecord(url, init));
        markGetStarted();
        return pendingGridResponse;
      };

      const hydration = userGrid.hydrateUserGridFromServer("user-a", {
        expectedAccessToken: "token-a",
        shouldApply: () =>
          sessionIsCurrent && storage.getItem("access_token") === "token-a",
      });
      await getStarted;

      sessionIsCurrent = false;
      storage.setItem("access_token", "token-b");
      storage.setItem("refresh_token", "refresh-b");
      resolveGridResponse(
        jsonResponse({
          grid: gridDocument({
            [managedKey]: "remote-session-a",
            [remoteOnlyKey]: "remote-only-session-a",
          }),
        }),
      );

      assert.equal(await hydration, false);
      assert.equal(storage.getItem(managedKey), "local-session-a");
      assert.equal(storage.getItem(remoteOnlyKey), null);
      assert.deepEqual(
        requests.map((request) => request.method),
        ["GET"],
        "a resposta obsoleta não pode disparar PUT de merge",
      );
      assert.equal(
        events.some(({ type }) => type === userGrid.USER_GRID_HYDRATED_EVENT),
        false,
        "a sessão substituída não pode ser anunciada como hidratada",
      );

      storage.setItem(managedKey, "changed-after-session-swap");
      userGrid.requestUserGridSync();
      assert.equal(await userGrid.flushUserGridSync(), false);
      assert.deepEqual(
        requests.map((request) => request.method),
        ["GET"],
        "o grid abandonado deve permanecer não persistível",
      );
    },
  );
});

test("flush pendente do grid A não grava autenticado pela sessão B", async () => {
  const managedKey = scopedKey(
    "ipxdata.card-views.v1",
    "company-a",
    "user-a",
  );

  await withBrowser(
    {
      access_token: "token-a",
      refresh_token: "refresh-a",
      [managedKey]: "grid-hidratado-a",
    },
    async ({ requests, storage }) => {
      let sessionIsCurrent = true;
      let scheduledFlush = null;
      globalThis.fetch = async (url, init = {}) => {
        requests.push(requestRecord(url, init));
        return jsonResponse({
          grid: gridDocument({
            [managedKey]: "grid-hidratado-a",
          }),
        });
      };

      assert.equal(
        await userGrid.hydrateUserGridFromServer("user-a", {
          expectedAccessToken: "token-a",
          shouldApply: () =>
            sessionIsCurrent && storage.getItem("access_token") === "token-a",
        }),
        true,
      );
      assert.deepEqual(
        requests.map(({ authorization, method }) => ({ authorization, method })),
        [{ authorization: "Bearer token-a", method: "GET" }],
      );

      globalThis.window.setTimeout = (callback) => {
        scheduledFlush = callback;
        return 91;
      };
      globalThis.window.clearTimeout = () => undefined;
      storage.setItem(managedKey, "mudança-local-pendente-a");
      userGrid.requestUserGridSync();
      assert.equal(typeof scheduledFlush, "function");

      sessionIsCurrent = false;
      storage.setItem("access_token", "token-b");
      storage.setItem("refresh_token", "refresh-b");

      assert.equal(await userGrid.flushUserGridSync(), false);
      scheduledFlush();
      await Promise.resolve();

      const putRequests = requests.filter(({ method }) => method === "PUT");
      assert.deepEqual(putRequests, []);
      assert.equal(
        requests.some(
          ({ authorization, method }) =>
            method === "PUT" && authorization === "Bearer token-b",
        ),
        false,
        "o flush abandonado não pode herdar a autenticação da sessão B",
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
      [companyAUserB]: "local-user-b",
      [legacyCompanyOnly]: "legacy-company-only",
      [operationalKey]: "operational-local",
      [unsupportedPersonalKey]: "unsupported-local",
    },
    async ({ requests, storage }) => {
      const remoteGrid = gridDocument({
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
        return jsonResponse({ grid: request.body.grid });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);

      assert.equal(storage.getItem(companyAUserA), "remote-current");
      assert.equal(storage.getItem(companyBUserA), "local-company-b");
      assert.equal(storage.getItem(occupancyAnalysisPreset), "analysis-preset");
      assert.equal(storage.getItem(companyAUserB), "local-user-b");
      assert.equal(storage.getItem(legacyCompanyOnly), "legacy-company-only");
      assert.equal(storage.getItem(operationalKey), "operational-local");
      assert.equal(
        storage.getItem(unsupportedPersonalKey),
        "unsupported-local",
      );

      const hydrationPut = requests.find((request) => request.method === "PUT");
      assert.ok(hydrationPut, "o merge local seguro deve ser persistido após GET");
      assert.equal(hydrationPut.body.grid.entries[companyAUserA], "remote-current");
      assert.equal(
        hydrationPut.body.grid.entries[companyBUserA],
        "local-company-b",
      );
      assert.equal(
        hydrationPut.body.grid.entries[occupancyAnalysisPreset],
        "analysis-preset",
      );
      assert.equal(
        hydrationPut.body.grid.entries[companyAUserB],
        "remote-user-b-must-stay-opaque",
      );
      assert.equal(
        hydrationPut.body.grid.entries[remoteOpaqueKey],
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
        lastPut.body.grid.entries[companyAUserA],
        "local-after-hydration",
      );
      assert.equal(lastPut.body.grid.entries[companyBUserA], "local-company-b");
      assert.equal(
        lastPut.body.grid.entries[companyAUserB],
        "remote-user-b-must-stay-opaque",
      );
      assert.equal(lastPut.body.grid.entries[remoteOpaqueKey], "opaque-server-value");
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
      globalThis.fetch = async (url, init = {}) => {
        const request = requestRecord(url, init);
        requests.push(request);
        if (request.method === "GET") {
          return jsonResponse({ grid: legacyGrid });
        }
        return jsonResponse({ grid: request.body.grid });
      };

      assert.equal(await userGrid.hydrateUserGridFromServer("user-a"), true);

      const migrationPut = requests.find((request) => request.method === "PUT");
      assert.ok(migrationPut);
      assert.deepEqual(migrationPut.body.grid.legacyGrid, legacyGrid);
      assert.deepEqual(migrationPut.body.grid.entries, {
        [managedKey]: "personal-settings",
      });
    },
  );
});

async function withBrowser(initialStorage, run) {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCustomEvent = globalThis.CustomEvent;
  const storage = memoryStorage(initialStorage);
  const requests = [];

  globalThis.CustomEvent = class TestCustomEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    addEventListener() {},
    clearInterval,
    clearTimeout,
    dispatchEvent() {},
    localStorage: storage,
    removeEventListener() {},
    setInterval,
    setTimeout,
  };

  try {
    await run({ requests, storage });
  } finally {
    userGrid.clearUserGridSync();
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.CustomEvent = previousCustomEvent;
  }
}

function scopedKey(baseKey, companyId, userId) {
  return `${baseKey}.company.${encodeSegment(companyId)}.user.${encodeSegment(userId)}`;
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

function requestRecord(url, init) {
  return {
    authorization: new Headers(init.headers).get("Authorization"),
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
