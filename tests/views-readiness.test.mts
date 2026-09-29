import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleLoader } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Video Wall espera o user-grid antes de criar perfil ou persistir a configuração", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/video-wall-manager.tsx"),
    "utf8",
  );

  assert.match(source, /const userGridReadiness = useUserGridReady\(userId\)/);
  assert.match(source, /configurationCanLoad\s*=\s*userGridReadiness !== "pending"/);
  assert.match(source, /configurationScopeCertified\s*=\s*configurationCanLoad &&/);
  assert.match(
    source,
    /if \(!configurationCanLoad\) \{[\s\S]*?return;[\s\S]*?function syncStoredConfiguration\(\)/,
  );
  assert.match(
    source,
    /window\.addEventListener\(USER_GRID_HYDRATED_EVENT, syncStoredConfiguration\)/,
  );
  assert.match(
    source,
    /window\.removeEventListener\(USER_GRID_HYDRATED_EVENT, syncStoredConfiguration\)/,
  );
  assert.match(
    source,
    /if \(userGridReadiness !== "ready" \|\| !scenarios\.length \|\| !profiles\.length\) return;/,
  );
});

test("Visões só consulta cenários com permissão e empresa definida", () => {
  const source = readFileSync(
    resolve(projectRoot, "components/app/views-manager.tsx"),
    "utf8",
  );
  const guard = source.indexOf("if (!canAccessViews || !requestedCompanyScopeId)");
  const request = source.indexOf('apiFetch<unknown>("/scenarios"');
  assert.ok(guard >= 0 && guard < request);
  assert.match(source, /\}, \[canAccessViews, companyScopeId, masterCrossCompanyScope\]\)/);
});

test("referência de visão não expõe o destino do usuário anterior na troca de sessão", () => {
  const reference = "ABCDEFGHIJKLMNOPQRSTUVWX";
  const targets = new Map([
    ["user-a", "/views/live?company_id=company-a"],
    ["user-b", "/views/live?company_id=company-b"],
  ]);
  const listeners = new Map<string, () => void>();
  const browser = globalThis as unknown as { window?: unknown };
  const previousWindow = browser.window;
  browser.window = {
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, listener);
    },
    location: { origin: "https://painel.example" },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
  };

  let state: unknown;
  let effect: (() => void) | undefined;
  const React = {
    useEffect(callback: () => void) {
      effect = callback;
    },
    useState(initial: () => unknown) {
      if (state === undefined) state = initial();
      return [state, (next: unknown) => { state = next; }];
    },
  };

  try {
    const load = createModuleLoader(projectRoot, {
      mocks: {
        react: React,
        "@/lib/master-company-scope": {
          getUserViewScopedStorageKey: (_key: string, _company: unknown, user: string) => user,
          readUserViewScopedStorageEntry: (_key: string, _company: unknown, user: string) => ({
            value: JSON.stringify({
              references: [{
                createdAt: "2026-09-01T00:00:00Z",
                pathname: "/views/live",
                reference,
                search: new URL(targets.get(user)!, "https://painel.example").search,
                updatedAt: "2026-09-01T00:00:00Z",
              }],
            }),
          }),
        },
        "@/lib/user-grid": {
          requestUserGridSync() {},
          USER_GRID_HYDRATED_EVENT: "hydrated",
        },
        "@/lib/user-grid-local": { writeUserGridPreference() {} },
      },
    });
    const { useViewLinkTarget } = load<{
      useViewLinkTarget: (ref: string, user: string, path: "/views/live") => {
        pathname: string;
        search: string;
      } | null;
    }>("lib/view-link-reference.ts");

    const first = useViewLinkTarget(reference, "user-a", "/views/live");
    assert.equal(new URLSearchParams(first?.search).get("company_id"), "company-a");
    assert.equal(
      useViewLinkTarget(reference, "user-b", "/views/live"),
      null,
      "nenhum frame pode reutilizar o destino da identidade anterior",
    );
    effect?.();
    const second = useViewLinkTarget(reference, "user-b", "/views/live");
    assert.equal(new URLSearchParams(second?.search).get("company_id"), "company-b");
    assert.equal(listeners.size, 3);
  } finally {
    browser.window = previousWindow;
  }
});
