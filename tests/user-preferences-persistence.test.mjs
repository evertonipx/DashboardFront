import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const personalStores = [
  "lib/demographics-date-range.ts",
  "lib/counting-report-period.ts",
  "lib/counting-report-view-settings.ts",
  "lib/dashboard-focus.ts",
  "lib/live-dashboard-settings.ts",
  "lib/live-operational-settings.ts",
  "lib/occupancy-analysis-window.ts",
  "lib/occupancy-custom-widgets.ts",
  "lib/occupancy-dashboard-settings.ts",
  "lib/occupancy-widget-settings.ts",
  "lib/period-analysis-widgets.ts",
  "lib/realtime-custom-widgets.ts",
  "lib/report-custom-widgets.ts",
  "lib/video-wall.ts",
  "lib/view-link-reference.ts",
  "lib/view-preferences.ts",
  "lib/widget-view-presets.ts",
  "components/app/scenario-comparison-card.tsx",
];

test("configurações pessoais e visões usam o writer central do user-grid", () => {
  for (const pathname of personalStores) {
    const source = readSource(pathname);
    assert.match(
      source,
      /writeUserGridPreference|removeUserGridPreference/,
      `${pathname} precisa notificar o user-grid ao persistir`,
    );
    assert.doesNotMatch(
      source,
      /localStorage\.(?:setItem|removeItem)/,
      `${pathname} não pode contornar o writer central`,
    );
  }
});

test("preferências globais são pessoais e configurações de Ocupação carregam escopo completo", () => {
  const sidebar = readSource("components/app/app-shell.tsx");
  const moduleTabs = readSource("components/app/dashboard-module-tabs.tsx");
  const occupancyReports = readSource(
    "components/app/occupancy-reports-dashboard.tsx",
  );

  assert.match(
    sidebar,
    /getUserViewScopedStorageKey\([\s\S]*?SIDEBAR_COLLAPSED_STORAGE_KEY/,
  );
  assert.match(sidebar, /writeUserGridPreference\(sidebarStorageKey/);
  assert.match(
    moduleTabs,
    /dashboardModuleStorageKey\(companyScopeId, user\?\.id\)/,
  );
  assert.match(moduleTabs, /writeUserGridPreference\(storageKey, module\)/);
  assert.match(
    occupancyReports,
    /loadLiveDashboardSettings\(companyScopeId, \{[\s\S]*?userId: user\?\.id,[\s\S]*?viewId: settingsViewId/,
  );
  assert.ok(
    occupancyReports.match(
      /saveLiveDashboardSettings\([\s\S]*?companyScopeId,\s*\{\s*userId,\s*viewId: settingsViewId\s*\}\s*\)/g,
    )?.length >= 2,
  );
});

test("normalização compartilhada com a rota server não importa o sincronizador client", () => {
  const viewPreferences = readSource("lib/view-preferences.ts");
  assert.match(viewPreferences, /from "@\/lib\/user-grid-local"/);
  assert.doesNotMatch(viewPreferences, /from "@\/lib\/user-grid"/);
});

test("fallback legado por empresa é materializado no namespace do usuário", () => {
  const scope = readSource("lib/master-company-scope.ts");
  assert.match(
    scope,
    /readUserViewScopedStorageEntry[\s\S]*?alreadyPersonal[\s\S]*?writeUserGridPreference\(personalKey, value\)/,
  );
  assert.match(scope, /hasUserGridKnownDeletion\(personalKey\)/);
});

test("sincronização usa outbox durável e atualiza fallbacks na mesma tela", () => {
  const local = readSource("lib/user-grid-local.ts");
  const grid = readSource("lib/user-grid.ts");
  const hook = readSource("components/app/use-card-preferences.ts");

  assert.match(local, /USER_GRID_OUTBOX_PREFIX/);
  assert.match(local, /acknowledgeUserGridLocalMutation/);
  assert.match(grid, /captureDurableLocalChanges/);
  assert.match(grid, /quarantinedEntries/);
  assert.match(hook, /getCardViewStorageReadKeys/);
  assert.match(hook, /detail\?\.viewId != null/);
});

test("segredos e estado de autenticação permanecem fora do grid pessoal", () => {
  const grid = readSource("lib/user-grid.ts");
  for (const forbidden of [
    "access_token",
    "refresh_token",
    "ipxdata.ai-insights-api-key.v1",
    "ipxdata.ai-insights-prompt.v1",
    "ipxdata.camera-groups.v1",
    "ipxdata.camera-worker-assignments.v1",
    "ipxdata.worker-location-assignments.v1",
  ]) {
    assert.equal(
      grid.includes(`\"${forbidden}\"`),
      false,
      `${forbidden} não pode ser registrado como preferência pessoal`,
    );
  }
});

function readSource(pathname) {
  return readFileSync(resolve(projectRoot, pathname), "utf8");
}
