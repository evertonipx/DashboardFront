import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createModuleLoader } from "./helpers/module-loader.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const load = createModuleLoader(root);
const preferences = load<typeof import("../lib/view-preferences.ts")>(
  "lib/view-preferences.ts",
);
const durationSource = readFileSync(
  resolve(root, "components/app/occupancy-duration-widgets.tsx"),
  "utf8",
);
const retiredIds = [
  "occupancy_duration_confirmed",
  "occupancy_duration_free",
  "occupancy_duration_rate",
  "occupancy_duration_longest",
] as const;

test("cards de duração descontinuados saem do catálogo, layout e exportação", () => {
  const catalogueIds = new Set(
    preferences.getCardMenuDefinition("occupancy").cards.map((card) => card.id),
  );
  const defaultIds = new Set(
    preferences.getDefaultCardPreferences("occupancy").map((card) => card.id),
  );
  for (const id of retiredIds) {
    assert.equal(catalogueIds.has(id), false, `${id} ainda está no catálogo`);
    assert.equal(defaultIds.has(id), false, `${id} ainda está no layout padrão`);
    assert.doesNotMatch(
      durationSource,
      new RegExp(`\\b${id}\\b`),
      `${id} ainda pode renderizar ou ser exportado`,
    );
  }
  assert.equal(catalogueIds.has("occupancy_duration_average"), true);
  assert.equal(catalogueIds.has("occupancy_duration_coverage"), true);
});

test("normalização elimina cards descontinuados mesmo com IDs salvos e explícitos", () => {
  const activeId = "occupancy_duration_average";
  const saved = [
    ...retiredIds.map((id) => ({ id, visible: true })),
    { id: activeId, visible: true, title: "Meu resumo" },
  ];
  const normalized = preferences.normalizeCardPreferences(
    "occupancy",
    saved,
    [...retiredIds, activeId],
  );
  assert.deepEqual(normalized.map((card) => card.id), [activeId]);
  assert.equal(normalized[0].title, "Meu resumo");
  assert.equal(normalized[0].visible, true);
});

test("visão salva só com cards descontinuados não vira visão nova", () => {
  const activeId = "occupancy_duration_load";
  const normalized = preferences.normalizeCardPreferences(
    "occupancy",
    retiredIds.map((id) => ({ id, visible: true })),
    [...retiredIds, activeId],
  );
  assert.deepEqual(normalized.map((card) => card.id), [activeId]);
  assert.equal(normalized[0].visible, false);
});
