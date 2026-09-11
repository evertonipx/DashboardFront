import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} };
  modules.set(path, loaded);
  const javascript = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("module", "exports", "require", javascript)(loaded, loaded.exports, (name) =>
    name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name));
  return loaded.exports;
}

const presentation = load("lib/demographics-presentation.ts");
const preferences = load("lib/view-preferences.ts");
const localGrid = load("lib/user-grid-local.ts");
const occupancy = load("lib/occupancy-color-palettes.ts");
const dimensions = {
  demographics_gender_mix: "gender",
  demographics_age_distribution: "age",
  demographics_emotion_distribution: "emotion",
  demographics_age_gender_pyramid: "age-gender",
  demographics_age_emotion_heatmap: "age-emotion",
};
const settings = Object.freeze({ type: "half-donut", orientation: "vertical", order: "ascending", emojis: true, palette: "cyber" });

test("padrões preservam composição, sequência etária e ranking de emoções", () => {
  const base = { orientation: "horizontal", order: "default", emojis: false, palette: "pink-blue" };
  assert.deepEqual(presentation.defaultDemographicPresentation("gender"), { ...base, type: "stacked" });
  assert.deepEqual(presentation.defaultDemographicPresentation("age"), { ...base, type: "bar" });
  assert.deepEqual(presentation.defaultDemographicPresentation("emotion"), { ...base, type: "bar", order: "descending" });
  assert.deepEqual(presentation.defaultDemographicPresentation("age-gender"), { ...base, type: "matrix" });
  assert.deepEqual(presentation.defaultDemographicPresentation("age-emotion"), { ...base, type: "heatmap" });
  const changed = presentation.defaultDemographicPresentation("gender");
  changed.palette = "cyber";
  assert.equal(presentation.defaultDemographicPresentation("gender").palette, "pink-blue");
});

test("normalizador aceita combinações de tipos, orientação, ordenação, emojis e paletas", () => {
  for (const dimension of ["gender", "age", "emotion"]) {
    for (const type of ["bar", "stacked", "pie", "donut", "half-donut", "rose"]) {
      for (const orientation of ["horizontal", "vertical"]) {
        for (const order of ["default", "ascending", "descending"]) {
          for (const emojis of [true, false]) {
            for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
              const value = Object.freeze({ type, orientation, order, emojis, palette });
              assert.deepEqual(presentation.normalizeDemographicPresentation(value, dimension), value);
            }
          }
        }
      }
    }
  }
});

test("configurações corrompidas usam defaults sem coerção ou propriedades extras", () => {
  for (const dimension of Object.values(dimensions)) {
    for (const invalid of [undefined, null, false, 1, "pie", [], { type: "script", orientation: "H", order: "ASC", emojis: "true", palette: "missing", extra: 1 }]) {
      assert.deepEqual(presentation.normalizeDemographicPresentation(invalid, dimension), presentation.defaultDemographicPresentation(dimension));
    }
  }
  assert.deepEqual(presentation.normalizeDemographicPresentation({ ...settings, extra: "discard" }, "gender"), settings);
  assert.equal(presentation.normalizeDemographicPresentation({ emojis: 1 }, "gender").emojis, false);
});

test("cruzamentos mantêm seu tipo e tipos de cruzamento não entram em distribuições", () => {
  assert.deepEqual(presentation.normalizeDemographicPresentation(settings, "age-gender"), { ...settings, type: "matrix" });
  assert.deepEqual(presentation.normalizeDemographicPresentation(settings, "age-emotion"), { ...settings, type: "heatmap" });
  for (const dimension of ["gender", "age", "emotion"]) {
    for (const type of ["matrix", "heatmap"]) {
      assert.equal(presentation.normalizeDemographicPresentation({ type }, dimension).type, presentation.defaultDemographicPresentation(dimension).type);
    }
  }
});

test("rosa e azul é primeira e todas as paletas de Ocupação são reutilizadas sem alteração", () => {
  const palettes = presentation.DEMOGRAPHICS_PALETTES;
  assert.equal(palettes[0].id, "pink-blue");
  assert.deepEqual(palettes[0].colors.slice(0, 3), ["#DB2777", "#2563EB", "#8A99AF"]);
  assert.ok(palettes[0].colors.length >= 9);
  assert.deepEqual(palettes.slice(1), occupancy.OCCUPANCY_COLOR_PALETTES);
  assert.equal(new Set(palettes.map((palette) => palette.id)).size, palettes.length);
  for (const palette of palettes) {
    assert.ok(palette.label && palette.description);
    assert.ok(palette.colors.every((color) => /^#[\da-f]{6}$/i.test(color)));
    assert.equal(presentation.getDemographicPalette(palette.id), palette);
  }
  assert.equal(presentation.getDemographicPalette("unknown"), palettes[0]);
});

test("nomes demográficos descrevem os pares reais sem renomear paletas compartilhadas ou IDs salvos", () => {
  const expected = {
    "pink-blue": ["Rosa e azul", "#DB2777", "#2563EB"],
    enterprise: ["Rosé e marinho", "#B85C7A", "#486F9E"],
    ocean: ["Coral e turquesa", "#E88078", "#008D9A"],
    aurora: ["Lavanda e esmeralda", "#AB7DE0", "#159A8C"],
    cyber: ["Orquídea e ciano", "#EF4FC8", "#00C5E0"],
    sunset: ["Pêssego e índigo", "#F08D68", "#5C65C6"],
    forest: ["Ameixa e verde-petróleo", "#A16BA9", "#248373"],
    berry: ["Framboesa e denim", "#B72E62", "#537BA5"],
    terracotta: ["Terracota e petróleo", "#CB776D", "#3B7C8D"],
    pastel: ["Lilás e menta", "#D0ACDD", "#8DCEC2"],
    high_contrast: ["Magenta e azul intenso", "#AD1457", "#005EB8"],
    colorblind: ["Malva e azul", "#CC79A7", "#0072B2"],
  };
  const before = structuredClone(presentation.DEMOGRAPHICS_PALETTES);
  assert.deepEqual(presentation.DEMOGRAPHICS_PALETTES.map(({ id }) => id), Object.keys(expected));
  assert.equal(new Set(Object.values(expected).map(([label]) => label)).size, 12);
  for (const { id: palette, label: originalLabel } of presentation.DEMOGRAPHICS_PALETTES) {
    const [label, Woman, Man] = expected[palette];
    for (const [id, dimension] of [["demographics_gender_mix", "gender"], ["demographics_age_gender_pyramid", "age-gender"]]) {
      assert.equal(presentation.demographicPaletteLabel(palette, dimension), label);
      assert.equal(presentation.demographicPaletteLabel(palette, dimension, "category"), label);
      assert.deepEqual(presentation.demographicPalettePreviewColors(palette, dimension), [Woman, Man]);
      assert.equal(presentation.demographicCategoryColor("Woman", 9, palette, dimension), Woman);
      assert.equal(presentation.demographicCategoryColor("Man", 0, palette, dimension), Man);
      if (palette !== "pink-blue") assert.notEqual(label, originalLabel, "nomes de gênero descrevem o par, não a paleta genérica de Ocupação");
      const demographics = { ...presentation.defaultDemographicPresentation(dimension), palette };
      const [restored] = preferences.normalizeCardPreferences("demographics", JSON.parse(JSON.stringify([{ id, visible: true, demographics }])), [id]);
      assert.deepEqual(restored.demographics, demographics);
      assert.equal(restored.demographics.palette, palette);
    }
    assert.equal(presentation.demographicPaletteLabel(palette, "emotion"), originalLabel);
    assert.equal(presentation.demographicPaletteLabel(palette, "age-emotion"), originalLabel);
    assert.equal(presentation.getDemographicPalette(palette).label, originalLabel);
  }
  assert.deepEqual(presentation.DEMOGRAPHICS_PALETTES, before);
  assert.deepEqual(presentation.DEMOGRAPHICS_PALETTES.slice(1), occupancy.OCCUPANCY_COLOR_PALETTES);
});

test("cores de categorias permanecem estáveis após ordenação e não dependem dos valores", () => {
  const categorySets = {
    gender: ["Woman", "Man", "unknown"],
    age: ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"],
    emotion: ["neutral", "happy", "surprise", "sad", "angry", "disgust", "fear", "contempt"],
  };
  for (const [dimension, keys] of Object.entries(categorySets)) {
    for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
      const originals = new Map(keys.map((key, index) => [key, presentation.demographicCategoryColor(key, index, palette, dimension)]));
      [...keys].reverse().forEach((key, index) => assert.equal(presentation.demographicCategoryColor(key, index, palette, dimension), originals.get(key)));
    }
  }
  assert.equal(presentation.demographicCategoryColor("Woman", 9, "pink-blue", "gender"), "#DB2777");
  assert.equal(presentation.demographicCategoryColor("Man", 0, "pink-blue", "gender"), "#2563EB");
  assert.equal(presentation.demographicCategoryColor("unknown", 0, "pink-blue", "age-gender"), "#8A99AF");
  for (const index of [NaN, Infinity, -3, 5.7]) {
    assert.match(presentation.demographicCategoryColor("future", index, "pink-blue", "age"), /^#[\da-f]{6}$/i);
  }
});

test("emojis são opcionais, preservam textos e não decoram categorias desconhecidas", () => {
  for (const [label, key, dimension] of [["Mulher", "Woman", "gender"], ["0-2", "0-2", "age"], ["Neutro", "neutral", "emotion"], ["Não identificado", "unknown", "age-gender"]]) {
    assert.equal(presentation.demographicCategoryLabel(label, key, dimension, false), label);
    const decorated = presentation.demographicCategoryLabel(label, key, dimension, true);
    assert.notEqual(decorated, label);
    assert.ok(decorated.startsWith(`${label} `));
    assert.match(decorated.slice(label.length + 1), /^\p{Extended_Pictographic}/u);
  }
  for (const key of ["future", "__proto__", "toString"]) {
    assert.equal(presentation.demographicCategoryLabel("Texto inteiro", key, "emotion", true), "Texto inteiro");
  }
});

test("somente os cinco IDs demográficos de gráficos têm dimensão configurável", () => {
  for (const [id, dimension] of Object.entries(dimensions)) assert.equal(presentation.demographicDimensionForCard(id), dimension);
  for (const id of ["demographics_total", "demographics_gender_leader", "occupancy_chart_hour", "demographics_custom", "__proto__", "toString"]) {
    assert.equal(presentation.demographicDimensionForCard(id), undefined);
  }
});

test("ausência de demographics preserva exatamente o formato legado normalizado", () => {
  const id = "demographics_gender_mix";
  const expected = { chartType: undefined, color: undefined, height: undefined, heightLevel: undefined, id, title: undefined, visible: false, size: undefined, widthLevel: undefined, zoom: undefined };
  assert.deepEqual(preferences.normalizeCardPreferences("demographics", [{ id, visible: false }], [id]), [expected]);
  assert.deepEqual(preferences.normalizeCardPreferences("demographics", [{ id, visible: false, demographics: undefined }], [id]), [expected]);
  for (const preference of preferences.getDefaultCardPreferences("demographics")) assert.equal(Object.hasOwn(preference, "demographics"), false);
});

test("normalização preserva campos existentes e limita demographics aos gráficos deste módulo", () => {
  const id = "demographics_gender_mix";
  const before = Object.freeze({ id, visible: false, color: "#1267C4", chartType: "bar", title: "  Gênero  ", size: "wide", height: "tall", zoom: 110, scenarioSelectionMode: "custom", scenarioIds: ["scenario-1"], demographics: settings });
  const normalized = preferences.normalizeCardPreferences("demographics", [before], [id])[0];
  assert.deepEqual(normalized.demographics, settings);
  assert.equal(normalized.visible, false);
  assert.equal(normalized.color, before.color);
  assert.equal(normalized.title, "Gênero");
  assert.equal(normalized.widthLevel, 3);
  assert.equal(normalized.heightLevel, 5);
  assert.equal(normalized.zoom, 110);
  assert.deepEqual(normalized.scenarioIds, ["scenario-1"]);
  assert.equal(normalized.scenarioSelectionMode, "custom");
  assert.equal(Object.hasOwn(preferences.normalizeCardPreferences("live", [before], [id])[0], "demographics"), false);
  for (const otherId of ["demographics_total", "demographics_custom", "occupancy_chart_hour"]) {
    const [other] = preferences.normalizeCardPreferences("demographics", [{ id: otherId, visible: true, demographics: settings }], [otherId]);
    assert.equal(Object.hasOwn(other, "demographics"), false);
  }
});

test("demographics nulo recupera defaults seguros e normalizar novamente é idempotente", () => {
  const cards = Object.keys(dimensions).map((id) => ({ id, visible: true, demographics: null }));
  const normalized = preferences.normalizeCardPreferences("demographics", cards, cards.map((card) => card.id));
  normalized.forEach((card) => assert.deepEqual(card.demographics, presentation.defaultDemographicPresentation(dimensions[card.id])));
  assert.deepEqual(preferences.normalizeCardPreferences("demographics", normalized, cards.map((card) => card.id)), normalized);
});

test("save/load real usa o mesmo namespace, outbox e isolamento por empresa, usuário e visão", (t) => {
  const previousWindow = globalThis.window;
  const stored = new Map();
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: (key) => stored.delete(key),
      key: (index) => [...stored.keys()][index] ?? null,
      get length() { return stored.size; },
    },
    dispatchEvent: (event) => { events.push(event); return true; },
  };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  const id = "demographics_gender_mix";
  const scopes = [["company-a", "user-a", "view-a"], ["company-b", "user-a", "view-a"], ["company-a", "user-b", "view-a"], ["company-a", "user-a", "view-b"]];
  scopes.forEach((scope, index) => {
    const value = { ...settings, palette: presentation.DEMOGRAPHICS_PALETTES[index].id };
    preferences.saveCardPreferences("demographics", [{ id, visible: true, demographics: value }], [id], ...scope);
  });
  const mutations = localGrid.readUserGridLocalMutations();
  assert.equal(mutations.length, scopes.length);
  scopes.forEach((scope, index) => {
    const key = preferences.getCardViewStorageKey(...scope);
    assert.ok(key.startsWith(preferences.CARD_VIEW_STORAGE_KEY));
    assert.ok(mutations.some((mutation) => mutation.key === key && !mutation.deleted));
    const [loaded] = preferences.loadScopedCardPreferences("demographics", [id], ...scope);
    assert.deepEqual(loaded.demographics, { ...settings, palette: presentation.DEMOGRAPHICS_PALETTES[index].id });
    assert.deepEqual(JSON.parse(stored.get(key)).demographics[0].demographics, loaded.demographics);
  });
  assert.equal(events.filter((event) => event.type === localGrid.USER_GRID_LOCAL_CHANGE_EVENT).length, scopes.length);
  assert.equal(events.filter((event) => event.type === preferences.CARD_VIEW_UPDATED_EVENT).length, scopes.length);
});
