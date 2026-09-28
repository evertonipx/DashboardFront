import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WidgetAppearanceProvider, useWidgetPalette, useWidgetPaletteId } from "../components/app/widget-appearance.tsx";

const loaded = await import("../lib/view-preferences.ts");
const preferences = ("default" in loaded ? loaded.default : loaded) as typeof import("../lib/view-preferences.ts");
const { normalizeCardPreferences } = preferences;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("visões antigas preservam cores individuais até escolher uma paleta", () => {
  const cards = normalizeCardPreferences("live", [
    { id: "first", visible: true, color: "#123456" },
    { id: "second", visible: true, color: "#ABCDEF" },
  ], ["first", "second"]);

  assert.deepEqual(cards.map((card) => card.color), ["#123456", "#ABCDEF"]);
  assert.ok(cards.every((card) => card.viewPaletteId === undefined));
});

test("paleta da visão cobre widgets existentes, ocultos e personalizados novos", () => {
  const cards = normalizeCardPreferences("live", [
    { id: "first", visible: true, color: "#123456", viewPaletteId: "ocean" },
    { id: "hidden", visible: false, color: "#ABCDEF" },
  ], ["first", "hidden", "custom-new"]);

  assert.deepEqual(cards.map((card) => card.color), ["#023E8A", "#0077B6", "#0096C7"]);
  assert.ok(cards.every((card) => card.viewPaletteId === "ocean"));
  assert.equal(cards[1].visible, false);
  assert.equal(cards[2].id, "custom-new");
});

test("a paleta de Demografia mantém sua opção semântica exclusiva", () => {
  const [gender, age] = normalizeCardPreferences("demographics", [
    { id: "demographics_gender_mix", visible: true, viewPaletteId: "pink-blue" },
  ], ["demographics_gender_mix", "demographics_age_distribution"]);

  assert.equal(gender.color, "#DB2777");
  assert.equal(age.color, "#2563EB");
  assert.equal(age.viewPaletteId, "pink-blue");
  const [invalid] = normalizeCardPreferences("occupancy", [
    { id: "occupancy_custom", visible: true, color: "#123456", viewPaletteId: "pink-blue" },
  ], ["occupancy_custom"]);
  assert.equal(invalid.color, "#123456");
  assert.equal(invalid.viewPaletteId, undefined);
});

test("painel central é a única seleção de paleta dos widgets", () => {
  const layout = readFileSync(resolve(root, "components/app/card-layout.tsx"), "utf8");
  const demographics = readFileSync(resolve(root, "components/app/demographics-dashboard.tsx"), "utf8");
  const liveOccupancy = readFileSync(resolve(root, "components/app/occupancy-scenario-dashboard.tsx"), "utf8");
  const reportOccupancy = readFileSync(resolve(root, "components/app/occupancy-reports-dashboard.tsx"), "utf8");

  assert.match(layout, /Paleta de cores desta visão/);
  assert.match(layout, /saveOccupancyWidgetSettings/);
  assert.match(layout, /card\.colorEditable === false && card\.previewColors/);
  assert.match(demographics, /palette: viewPaletteId/);
  assert.doesNotMatch(liveOccupancy, /<OccupancyPaletteSelect/);
  assert.doesNotMatch(reportOccupancy, /<OccupancyPaletteSelect/);
});

test("cada widget recebe a paleta completa da visão para séries e heatmaps", () => {
  const layout = readFileSync(resolve(root, "components/app/card-layout.tsx"), "utf8");
  const appearance = readFileSync(resolve(root, "components/app/widget-appearance.tsx"), "utf8");

  assert.match(layout, /paletteColors=\{viewPaletteColors\}/);
  assert.match(layout, /paletteId=\{viewPaletteId\}/);
  assert.match(layout, /<WidgetAppearanceProvider[\s\S]*?paletteColors=\{paletteColors\}[\s\S]*?paletteId=\{paletteId\}/);
  assert.match(appearance, /export function useWidgetPalette\(\)/);
  assert.match(appearance, /export function useWidgetPaletteId\(\)/);
});

test("contexto visual entrega paleta integral apenas quando a visão a definiu", () => {
  function Probe() {
    const colors = useWidgetPalette();
    const id = useWidgetPaletteId();
    return React.createElement("span", null, `${id ?? "legacy"}:${colors?.join(",") ?? "none"}`);
  }

  const configured = renderToStaticMarkup(React.createElement(
    WidgetAppearanceProvider,
    {
      paletteColors: ["#111111", "#222222"],
      paletteId: "ocean",
    } as unknown as React.ComponentProps<typeof WidgetAppearanceProvider>,
    React.createElement(Probe),
  ));
  const legacy = renderToStaticMarkup(React.createElement(
    WidgetAppearanceProvider,
    {} as React.ComponentProps<typeof WidgetAppearanceProvider>,
    React.createElement(Probe),
  ));

  assert.match(configured, /ocean:#111111,#222222/);
  assert.match(legacy, /legacy:none/);
});

test("a prévia Bento e as exportações de Contagem preservam a paleta da visão", () => {
  const layout = readFileSync(resolve(root, "components/app/card-layout.tsx"), "utf8");
  const live = readFileSync(resolve(root, "components/app/realtime-dashboard.tsx"), "utf8");
  const analysis = readFileSync(resolve(root, "components/app/period-analysis-dashboard.tsx"), "utf8");
  const reports = readFileSync(resolve(root, "components/app/scenario-reports-dashboard.tsx"), "utf8");

  assert.match(layout, /colors: configuredPaletteColors \?\?/);
  assert.match(live, /option: applyCountingViewPalette\(/);
  assert.match(analysis, /option: applyCountingViewPalette\(/);
  assert.match(reports, /option: applyCountingViewPalette\(/);
});
