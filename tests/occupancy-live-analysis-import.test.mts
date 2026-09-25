import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildOccupancyLiveAnalysisImport,
  occupancyPresetStorageValue,
} from "../lib/occupancy-live-analysis-import.ts";
import type { CardPreference } from "../lib/view-preferences.ts";
import type { WidgetViewSnapshot } from "../lib/widget-view-presets.ts";
import { createModuleLoader } from "./helpers/module-loader.mts";

function snapshot(
  preferences: CardPreference[],
  cardIds = preferences.map((preference) => preference.id),
): WidgetViewSnapshot {
  return {
    cardIds,
    capturedAt: "2026-09-25T12:00:00.000Z",
    menuKey: "occupancy",
    preferences,
    sourceScope: { id: "scenario-a", name: "Entrada" },
    storage: [],
    version: 1,
  };
}

test("converte métricas e gráficos históricos e preserva a aparência e a ordem", () => {
  const pairs = [
    ["occupancy_chart_day", "occupancy_report_day"],
    ["occupancy_current_total", "occupancy_report_current"],
    ["occupancy_average", "occupancy_report_average"],
    ["occupancy_peak", "occupancy_report_peak"],
    ["occupancy_minimum", "occupancy_report_minimum"],
    ["occupancy_chart_minute", "occupancy_report_minute"],
    ["occupancy_chart_hour", "occupancy_report_hour"],
  ] as const;
  const preferences: CardPreference[] = pairs.map(([id]) => ({ id, visible: true }));
  preferences[0] = {
    chartType: "bar",
    color: "#123456",
    height: "tall",
    heightLevel: 5,
    id: pairs[0][0],
    scenarioIds: ["scenario-b", "missing", "scenario-a", "scenario-b"],
    scenarioOrder: ["scenario-a", "missing", "scenario-b", "scenario-a"],
    scenarioSelectionMode: "custom",
    size: "large",
    title: "Meu gráfico",
    visible: true,
    widthLevel: 5,
    zoom: 110,
  };
  const source = snapshot(preferences);
  const original = structuredClone(source);
  const targetCardIds = [
    "occupancy_report_peak",
    "occupancy_report_current",
    "occupancy_report_day",
    "occupancy_report_average",
    "occupancy_report_minimum",
    "occupancy_report_minute",
    "occupancy_report_hour",
    "occupancy_active_areas",
  ];

  const result = buildOccupancyLiveAnalysisImport({
    availableScenarioIds: ["scenario-a", "scenario-b"],
    snapshot: source,
    targetCardIds,
  });

  assert.equal(result.sourceCardCount, pairs.length);
  assert.equal(result.importedCount, pairs.length);
  assert.equal(result.unsupportedCount, 0);
  assert.deepEqual(
    result.preferences.map(({ id }) => id),
    [...pairs.map(([, id]) => id), "occupancy_active_areas"],
  );
  assert.deepEqual(result.preferences[0], {
    chartType: "bar",
    color: "#123456",
    height: "tall",
    heightLevel: 5,
    id: "occupancy_report_day",
    scenarioIds: ["scenario-b", "scenario-a"],
    scenarioOrder: ["scenario-a", "scenario-b"],
    scenarioSelectionMode: "custom",
    size: "large",
    title: "Meu gráfico",
    visible: true,
    widthLevel: 5,
    zoom: 110,
  });
  assert.deepEqual(result.preferences.at(-1), {
    id: "occupancy_active_areas",
    visible: false,
  });
  assert.deepEqual(source, original, "a conversão não altera o preset salvo");
});

test("importa apenas cards compartilhados existentes no destino e deixa os outros ocultos", () => {
  const source = snapshot(
    [
      { id: "occupancy_scenario_half_donut", visible: true },
      { id: "occupancy_duration_average", visible: true },
      { id: "occupancy_loitering_summary", visible: false },
      { id: "occupancy_custom_1", visible: true },
      { id: "occupancy_chart_week", visible: true },
      { id: "occupancy_alerts", visible: true },
    ],
    [
      "occupancy_scenario_half_donut",
      "occupancy_duration_average",
      "occupancy_loitering_summary",
      "occupancy_custom_1",
      "occupancy_chart_week",
      "occupancy_alerts",
      "occupancy_chart_hour",
    ],
  );
  const targetCardIds = [
    "occupancy_report_hour",
    "occupancy_loitering_summary",
    "occupancy_scenario_half_donut",
    "occupancy_duration_average",
    "occupancy_custom_1",
    "occupancy_report_current",
  ];
  const result = buildOccupancyLiveAnalysisImport({
    availableScenarioIds: [],
    snapshot: source,
    targetCardIds,
  });

  assert.equal(result.sourceCardCount, 6);
  assert.equal(result.unsupportedCount, 2);
  assert.equal(result.importedCount, 4);
  assert.deepEqual(
    result.preferences.filter((preference) => preference.visible).map(({ id }) => id),
    [
      "occupancy_scenario_half_donut",
      "occupancy_duration_average",
      "occupancy_custom_1",
      "occupancy_report_hour",
    ],
  );
  assert.deepEqual(
    result.preferences.filter((preference) => !preference.visible).map(({ id }) => id),
    ["occupancy_loitering_summary", "occupancy_report_current"],
  );

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const viewPreferences = createModuleLoader(projectRoot)<
    typeof import("../lib/view-preferences.ts")
  >("lib/view-preferences.ts");
  const normalized = viewPreferences.normalizeCardPreferences(
    "occupancy",
    result.preferences,
    targetCardIds,
  );
  assert.deepEqual(
    normalized.filter((preference) => preference.visible).map(({ id }) => id),
    result.preferences.filter((preference) => preference.visible).map(({ id }) => id),
    "salvar a visão não deve reativar cards ausentes no preset",
  );
});

test("não cria cards visíveis quando a visão não tem equivalentes históricos", () => {
  const result = buildOccupancyLiveAnalysisImport({
    availableScenarioIds: ["scenario-a"],
    snapshot: snapshot([
      { id: "occupancy_alerts", visible: true },
      { id: "occupancy_chart_hour", visible: false },
    ]),
    targetCardIds: ["occupancy_report_hour", "occupancy_report_current"],
  });

  assert.equal(result.sourceCardCount, 1);
  assert.equal(result.importedCount, 0);
  assert.equal(result.unsupportedCount, 1);
  assert.ok(result.preferences.every((preference) => !preference.visible));
});

test("seleção personalizada sem cenários válidos não vira todos os cenários", () => {
  const result = buildOccupancyLiveAnalysisImport({
    availableScenarioIds: ["scenario-a"],
    snapshot: snapshot([
      {
        id: "occupancy_scenario_max_month",
        scenarioIds: ["other-company-scenario"],
        scenarioSelectionMode: "custom",
        visible: true,
      },
    ]),
    targetCardIds: ["occupancy_scenario_max_month"],
  });

  assert.equal(result.importedCount, 0);
  assert.equal(result.unsupportedCount, 1);
  assert.deepEqual(result.preferences, [
    { id: "occupancy_scenario_max_month", visible: false },
  ]);
});

test("lê configurações do preset sem aplicar armazenamento bruto", () => {
  const source = snapshot([]);
  source.storage = [
    { baseKey: "valid", value: '{"palette":"blue"}' },
    { baseKey: "broken", value: "{" },
  ];

  assert.deepEqual(occupancyPresetStorageValue(source, "valid"), {
    palette: "blue",
  });
  assert.equal(occupancyPresetStorageValue(source, "broken"), undefined);
  assert.equal(occupancyPresetStorageValue(source, "missing"), undefined);
});
