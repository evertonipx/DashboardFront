import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { RuntimeFixture } from "./helpers/module-loader.mts";
import { createModuleLoader } from "./helpers/module-loader.mts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = createModuleLoader(projectRoot);
const presets = load("lib/widget-view-presets.ts");
const scope = load("lib/master-company-scope.ts");
const preferences = load("lib/view-preferences.ts");
const browser = globalThis as unknown as Record<string, RuntimeFixture>;

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    key(index: number) { return [...entries.keys()][index] ?? null; },
    getItem(key: string) { return entries.get(key) ?? null; },
    setItem(key: string, value: string) { entries.set(key, value); },
    removeItem(key: string) { entries.delete(key); },
  };
}

function withBrowser(run: (storage: ReturnType<typeof memoryStorage>) => void) {
  const oldWindow = browser.window;
  const oldCustomEvent = browser.CustomEvent;
  const storage = memoryStorage();
  browser.CustomEvent = class CustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, options: { detail?: unknown } = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  browser.window = { dispatchEvent() {}, localStorage: storage };
  try {
    run(storage);
  } finally {
    if (oldWindow === undefined) delete browser.window;
    else browser.window = oldWindow;
    if (oldCustomEvent === undefined) delete browser.CustomEvent;
    else browser.CustomEvent = oldCustomEvent;
  }
}

function preset(snapshot: RuntimeFixture) {
  return {
    createdAt: "2026-09-28T10:00:00.000Z",
    id: "saved-view-a",
    isDefault: false,
    name: "Visão do cliente",
    snapshot,
    updatedAt: "2026-09-28T10:00:00.000Z",
  };
}

test("backup de uma visão preserva configurações demográficas e escopo do cliente", () => {
  withBrowser((storage) => {
    const cardIds = ["demographics_gender_mix", "demographics_gender_timeline"];
    const sourceScope = { id: "demographics-analysis", name: "Análises" };
    const rangeKey = "ipxdata.demographics-range.v1";
    storage.setItem(
      scope.getUserViewScopedStorageKey(rangeKey, "company-a", "user-a", "analysis"),
      JSON.stringify({ startInput: "2026-09-01", endInput: "2026-09-28" }),
    );
    const snapshot = presets.captureWidgetViewSnapshot({
      cardIds,
      companyId: "company-a",
      menuKey: "demographics",
      preferences: [
        {
          id: cardIds[0],
          visible: true,
          color: "#123456",
          viewPaletteId: "cyber",
          demographics: {
            type: "pie",
            orientation: "vertical",
            order: "ascending",
            emojis: true,
            palette: "cyber",
          },
        },
        {
          id: cardIds[1],
          visible: true,
          viewPaletteId: "cyber",
          demographicsTemporal: {
            dimension: "gender",
            metric: "count",
            granularity: "day",
            chartType: "area",
            categoryKeys: ["Woman"],
            palette: "cyber",
          },
        },
      ],
      sourceScope,
      userId: "user-a",
    });
    const raw = presets.serializeWidgetViewBackup(preset(snapshot), {
      companyId: "company-a",
      presetNamespace: "demographics",
    });
    const parsed = presets.parseWidgetViewBackup(raw, {
      companyId: "company-a",
      menuKey: "demographics",
      presetNamespace: "demographics",
    });
    assert.equal(parsed.name, "Visão do cliente");
    assert.equal(parsed.snapshot.preferences[0].demographics.type, "pie");
    assert.equal(parsed.snapshot.preferences[0].demographics.palette, "cyber");
    assert.equal(parsed.snapshot.preferences[0].viewPaletteId, "cyber");
    assert.equal(parsed.snapshot.preferences[1].demographicsTemporal.chartType, "area");
    assert.deepEqual(parsed.snapshot.preferences[1].demographicsTemporal.categoryKeys, ["Woman"]);
    assert.deepEqual(parsed.snapshot.dependentScopes, ["demographics-surface"]);

    presets.applyWidgetViewPreset(preset(parsed.snapshot), {
      companyId: "company-a",
      targetScope: sourceScope,
      userId: "user-b",
    });
    const restored = preferences.loadScopedCardPreferences(
      "demographics", cardIds, "company-a", "user-b", sourceScope.id,
    );
    assert.equal(restored[0].demographics.type, "pie");
    assert.equal(restored[0].viewPaletteId, "cyber");
    assert.equal(restored[1].demographicsTemporal.chartType, "area");
    assert.deepEqual(JSON.parse(storage.getItem(
      scope.getUserViewScopedStorageKey(rangeKey, "company-a", "user-b", "analysis"),
    )!), { startInput: "2026-09-01", endInput: "2026-09-28" });
    assert.equal(storage.getItem("access_token"), null);
  });
});

test("importação rejeita empresa, tela, versão e chave de configuração inválidas sem gravar", () => {
  withBrowser((storage) => {
    const snapshot = presets.captureWidgetViewSnapshot({
      cardIds: ["live_today_total"],
      companyId: "company-a",
      menuKey: "live",
      preferences: [{ id: "live_today_total", visible: true }],
      userId: "user-a",
    });
    const backup = presets.serializeWidgetViewBackup(preset(snapshot), {
      companyId: "company-a",
      presetNamespace: "live",
    });
    const options = {
      companyId: "company-a", menuKey: "live", presetNamespace: "live",
    };
    const before = storage.length;
    assert.throws(() => presets.parseWidgetViewBackup(backup, {
      ...options, companyId: "company-b",
    }), /outra empresa/);
    assert.throws(() => presets.parseWidgetViewBackup(backup, {
      ...options, menuKey: "reports", presetNamespace: "reports",
    }), /outra tela/);
    const future = JSON.parse(backup);
    future.version = 2;
    assert.throws(() => presets.parseWidgetViewBackup(JSON.stringify(future), options), /versão/);
    const unsafe = JSON.parse(backup);
    unsafe.view.snapshot.storage.push({ baseKey: "access_token", value: '"secret"' });
    assert.throws(() => presets.parseWidgetViewBackup(JSON.stringify(unsafe), options), /inválida/);
    const wrongPalette = JSON.parse(backup);
    wrongPalette.view.snapshot.preferences[0].viewPaletteId = "pink-blue";
    assert.throws(() => presets.parseWidgetViewBackup(JSON.stringify(wrongPalette), options), /paleta/);
    assert.equal(storage.length, before);
  });
});

test("preset legado de Análises com widget custom não anuncia backup completo", () => {
  withBrowser(() => {
    const snapshot = {
      cardIds: ["occupancy_custom_old"],
      capturedAt: "2026-09-28T10:00:00.000Z",
      menuKey: "occupancy",
      preferences: [{ id: "occupancy_custom_old", visible: true }],
      sourceScope: { id: "analysis:scenario-a", name: "Cenário A" },
      storage: [],
      version: 1,
    };
    assert.throws(() => presets.serializeWidgetViewBackup(preset(snapshot), {
      companyId: "company-a", presetNamespace: "occupancy-analysis",
    }), /Atualize esta visão salva/);
  });
});

test("backup de Contagem restaura widget criado, filtros, ordem e tamanho em outro usuário", () => {
  withBrowser((storage) => {
    const sourceScope = { id: "scope-a", name: "Origem" };
    const targetScope = { id: "scope-b", name: "Destino" };
    const customId = "custom-widget-a";
    const customCardId = `live_custom_${customId}`;
    const comparisonKey = `ipxdata.live-custom-${customId}.scenario-comparison.v1`;
    const customKey = "ipxdata.realtime-custom-widgets.v1";
    const scopedKey = (baseKey: string, userId: string, viewId: string) =>
      scope.getUserViewScopedStorageKey(baseKey, "company-a", userId, viewId);
    storage.setItem(scopedKey(customKey, "user-a", sourceScope.id), JSON.stringify([{
      id: customId, kind: "scope", title: "Loja A", scopeId: sourceScope.id,
      scopeMode: "scenario", scopeName: sourceScope.name, granularity: "hour",
      created_at: "2026-09-28T10:00:00.000Z",
      updated_at: "2026-09-28T10:00:00.000Z",
    }]));
    storage.setItem(scopedKey(comparisonKey, "user-a", sourceScope.id), JSON.stringify({
      mode: "custom", scenarioIds: ["scenario-2", "scenario-1"],
    }));
    const cardIds = [customCardId, "live_today_total"];
    const saved = presets.saveWidgetViewPresets("live", [preset(
      presets.captureWidgetViewSnapshot({
        cardIds,
        companyId: "company-a",
        menuKey: "live",
        preferences: [
          {
            id: customCardId, visible: true, title: "Minha loja", color: "#345678",
            chartType: "line", widthLevel: 5, heightLevel: 3, zoom: 110,
            scenarioSelectionMode: "custom",
            scenarioIds: ["scenario-2", "scenario-1"],
            scenarioOrder: ["scenario-1", "scenario-2"],
          },
          { id: "live_today_total", visible: false, widthLevel: 1 },
        ],
        sourceScope,
        userId: "user-a",
      }),
    )], "company-a", "user-a")[0];
    const backup = presets.serializeWidgetViewBackup(saved, {
      companyId: "company-a", presetNamespace: "live",
    });
    const imported = presets.parseWidgetViewBackup(backup, {
      companyId: "company-a", menuKey: "live", presetNamespace: "live",
    });
    assert.equal(presets.applyWidgetViewPreset(preset(imported.snapshot), {
      companyId: "company-a", targetScope, userId: "user-b",
    }), true);

    const restoredWidgets = JSON.parse(storage.getItem(scopedKey(customKey, "user-b", targetScope.id))!);
    assert.equal(restoredWidgets[0].scopeId, targetScope.id);
    assert.equal(restoredWidgets[0].scopeName, targetScope.name);
    assert.deepEqual(JSON.parse(storage.getItem(scopedKey(comparisonKey, "user-b", targetScope.id))!).scenarioIds,
      ["scenario-2", "scenario-1"]);
    const restored = preferences.loadScopedCardPreferences(
      "live", cardIds, "company-a", "user-b", targetScope.id,
    );
    assert.deepEqual(restored.map((card: RuntimeFixture) => card.id), cardIds);
    assert.deepEqual(restored.map((card: RuntimeFixture) => card.visible), [true, false]);
    assert.equal(restored[0].title, "Minha loja");
    assert.equal(restored[0].widthLevel, 5);
    assert.equal(restored[0].heightLevel, 3);
    assert.equal(restored[0].zoom, 110);
    assert.deepEqual(restored[0].scenarioIds, ["scenario-2", "scenario-1"]);
    assert.deepEqual(restored[0].scenarioOrder, ["scenario-1", "scenario-2"]);
  });
});

test("backup de Análises de Ocupação leva widgets personalizados e capacidade do cenário", () => {
  withBrowser((storage) => {
    const scopedKey = (baseKey: string, viewId: string) =>
      scope.getUserViewScopedStorageKey(baseKey, "company-a", "user-a", viewId);
    const customKey = "ipxdata.occupancy-custom-widgets.v1";
    const settingsKey = "ipxdata.occupancy-widget-settings.v1";
    const customWidgets = [{
      id: "custom-a", kind: "metric", metric: "current", title: "Entrada",
      created_at: "2026-09-28T10:00:00.000Z",
      updated_at: "2026-09-28T10:00:00.000Z",
    }];
    storage.setItem(scopedKey(customKey, "scenario-a"), JSON.stringify(customWidgets));
    storage.setItem(scopedKey(settingsKey, "scenario-a"), JSON.stringify({
      capacities: { "scenario-a": 80 }, colorPaletteId: "cyber",
    }));
    storage.setItem(scopedKey(customKey, "scenario-b"), JSON.stringify([{ id: "old" }]));

    const snapshot = presets.captureWidgetViewSnapshot({
      cardIds: ["occupancy_custom_custom-a"],
      companyId: "company-a",
      menuKey: "occupancy",
      preferences: [{ id: "occupancy_custom_custom-a", visible: true }],
      sourceScope: { id: "analysis:scenario-a", name: "Origem" },
      userId: "user-a",
    });
    assert.deepEqual(snapshot.dependentScopes, ["occupancy-scenario"]);
    assert.equal(snapshot.storage.filter((entry: RuntimeFixture) => entry.scope === "occupancy-scenario").length, 2);
    const raw = presets.serializeWidgetViewBackup(preset(snapshot), {
      companyId: "company-a", presetNamespace: "occupancy-analysis",
    });
    const parsed = presets.parseWidgetViewBackup(raw, {
      companyId: "company-a", menuKey: "occupancy", presetNamespace: "occupancy-analysis",
    });
    assert.equal(presets.applyWidgetViewPreset(preset(parsed.snapshot), {
      companyId: "company-a",
      presetNamespace: "occupancy-analysis",
      targetScope: { id: "analysis:scenario-b", name: "Destino" },
      userId: "user-a",
    }), true);
    assert.deepEqual(JSON.parse(storage.getItem(scopedKey(customKey, "scenario-b"))!), customWidgets);
    assert.deepEqual(JSON.parse(storage.getItem(scopedKey(settingsKey, "scenario-b"))!).capacities, {
      "scenario-b": 80,
    });
    assert.equal(storage.getItem(scopedKey(customKey, "scenario-a")), JSON.stringify(customWidgets));

    const emptySource = presets.captureWidgetViewSnapshot({
      cardIds: ["occupancy_report_current"],
      companyId: "company-a",
      menuKey: "occupancy",
      preferences: [{ id: "occupancy_report_current", visible: true }],
      sourceScope: { id: "analysis:scenario-c", name: "Sem customização" },
      userId: "user-a",
    });
    assert.deepEqual(emptySource.dependentScopes, ["occupancy-scenario"]);
    assert.equal(presets.applyWidgetViewPreset(preset(emptySource), {
      companyId: "company-a",
      presetNamespace: "occupancy-analysis",
      targetScope: { id: "analysis:scenario-b", name: "Destino" },
      userId: "user-a",
    }), true);
    assert.equal(storage.getItem(scopedKey(customKey, "scenario-b")), null);
    assert.equal(storage.getItem(scopedKey(settingsKey, "scenario-b")), null);
  });
});
