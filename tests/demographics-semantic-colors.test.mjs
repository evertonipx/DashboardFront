import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  const loaded = { exports: {} };
  modules.set(path, loaded);
  const compiled = ts.transpileModule(readFileSync(resolve(root, path), "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("module", "exports", "require", compiled)(loaded, loaded.exports, (name) => {
    if (!name.startsWith("@/")) return require(name);
    const base = name.slice(2);
    return load(`${base}${existsSync(resolve(root, `${base}.ts`)) ? ".ts" : ".tsx"}`);
  });
  return loaded.exports;
}

const presentation = load("lib/demographics-presentation.ts");
const { OCCUPANCY_COLOR_PALETTES } = load("lib/occupancy-color-palettes.ts");
const { buildDemographicDistributionOption: build } = load("lib/demographics-chart-options.ts");
const { DemographicsWidgetControls: Controls } = load("components/app/demographics-widget-controls.tsx");
const { DemographicsTemporalControls: TemporalControls } = load("components/app/demographics-temporal-controls.tsx");
const { defaultDemographicTemporalSettings } = load("lib/demographics-temporal-preferences.ts");
const { normalizeCardPreferences } = load("lib/view-preferences.ts");
const AGE_KEYS = ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"];
const categories = [
  { key: "Woman", label: "Mulher", count: 20, percentage: 20, observed: true },
  { key: "Man", label: "Homem", count: 70, percentage: 70, observed: true },
  { key: "unknown", label: "Não identificado", count: 10, percentage: 10, observed: true },
];
function rgb(color) { return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)); }
function hue(color) {
  const [red, green, blue] = rgb(color).map((channel) => channel / 255);
  const maximum = Math.max(red, green, blue);
  const range = maximum - Math.min(red, green, blue);
  const component = maximum === red ? (green - blue) / range : maximum === green ? (blue - red) / range + 2 : (red - green) / range + 4;
  return (60 * component + 360) % 360;
}
function luminance(color) {
  const channels = rgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test("paletas demográficas variam Mulher entre violeta, rosa e coral, Homem entre azul, turquesa e menta", () => {
  for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
    const colors = presentation.getDemographicGenderPalette(id);
    const womanHue = hue(colors.Woman);
    // Aurora's lavender is267.88°, still in the intended violet family.
    assert.ok(womanHue >= 265 && womanHue <= 360 || womanHue >= 0 && womanHue <= 25, `${id}: Mulher deve permanecer violeta/rosa/coral`);
    assert.ok(hue(colors.Man) >= 160 && hue(colors.Man) <= 240, `${id}: Homem deve permanecer azul/turquesa/menta`);
    assert.equal(colors.unknown, "#8A99AF");
    assert.ok(Math.max(...rgb(colors.unknown)) - Math.min(...rgb(colors.unknown)) <= 40);
    assert.equal(new Set(Object.values(colors)).size, 3);
  }
  assert.deepEqual(presentation.getDemographicGenderPalette("pink-blue"), { Woman: "#DB2777", Man: "#2563EB", unknown: "#8A99AF" });
  assert.deepEqual(presentation.getDemographicGenderPalette("invalid"), presentation.getDemographicGenderPalette("pink-blue"));
});

test("as doze opções oferecem pares distintos e variação real de matiz e luminosidade", () => {
  const pairs = presentation.DEMOGRAPHICS_PALETTES.map(({ id }) => presentation.getDemographicGenderPalette(id));
  assert.equal(pairs.length, 12);
  assert.equal(new Set(pairs.map(({ Woman, Man }) => `${Woman}/${Man}`)).size, 12);
  for (const key of ["Woman", "Man"]) {
    const colors = pairs.map((pair) => pair[key]);
    const hues = colors.map(hue);
    const luminances = colors.map(luminance);
    assert.equal(new Set(colors).size, 12, `${key}: cada opção precisa de uma cor efetivamente diferente`);
    assert.ok(new Set(hues.map((value) => Math.floor(value / 15))).size >= 5, `${key}: variar famílias de matiz, não apenas versões do mesmo tom`);
    assert.ok(Math.max(...luminances) - Math.min(...luminances) >= 0.2, `${key}: opções claras e profundas precisam ser visualmente distintas`);
    assert.ok(new Set(luminances.map((value) => Math.floor(value * 10))).size >= 3, `${key}: pelo menos três faixas de luminosidade`);
  }
});

test("reordenar ou filtrar gêneros nunca remapeia Homem ou unknown para a primeira cor rosa", () => {
  for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
    const expected = presentation.getDemographicGenderPalette(id);
    for (const dimension of ["gender", "age-gender"]) {
      for (const keys of [["Woman", "Man", "unknown"], ["unknown", "Man", "Woman"], ["Man"], ["unknown"]]) {
        keys.forEach((key, index) => assert.equal(presentation.demographicCategoryColor(key, index, id, dimension), expected[key]));
      }
      for (const key of ["future", "__proto__", "toString"]) assert.equal(presentation.demographicCategoryColor(key, 0, id, dimension), expected.unknown);
    }
  }
});

test("formatos reais usam cores semânticas estáveis com todas as paletas, ordens e filtros", () => {
  const original = structuredClone(categories);
  for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
    const expected = presentation.getDemographicGenderPalette(palette);
    for (const type of ["bar", "stacked", "pie", "donut", "half-donut", "rose"]) {
      for (const order of ["default", "ascending", "descending"]) {
        for (const items of [categories, categories.filter(({ key }) => key === "Man")]) {
          const option = build(items, { ...presentation.defaultDemographicPresentation("gender"), palette, type, order }, { dimension: "gender" });
          const data = option.series.flatMap((series) => series.data);
          const identified = items.filter(({ key }) => key === "Woman" || key === "Man");
          assert.equal(data.length, identified.length);
          assert.ok(data.every(({ key }) => key === "Woman" || key === "Man"));
          assert.equal(data.reduce((total, point) => total + point.percentage, 0), 100);
          for (const point of data) {
            assert.equal(point.itemStyle.color, expected[point.key]);
            assert.equal(point.count, items.find(({ key }) => key === point.key).count);
            assert.equal(point.percentage, identified.length === 1 ? 100 : point.key === "Woman" ? 22.22 : 77.78);
          }
        }
      }
    }
  }
  assert.deepEqual(categories, original);
});

test("semântica demográfica não altera paletas originais de Ocupação ou cores das emoções", () => {
  const before = structuredClone(OCCUPANCY_COLOR_PALETTES);
  for (const palette of presentation.DEMOGRAPHICS_PALETTES) {
    assert.deepEqual(presentation.demographicPalettePreviewColors(palette.id, "age"), presentation.getDemographicAgePalette(palette.id));
    assert.equal(presentation.demographicPalettePreviewColors(palette.id, "emotion"), palette.colors);
    assert.equal(presentation.demographicPalettePreviewColors(palette.id, "age-emotion"), palette.colors);
    assert.equal(presentation.demographicCategoryColor("0-2", 0, palette.id, "age"), presentation.getDemographicAgePalette(palette.id)[0]);
    assert.equal(presentation.demographicCategoryColor("happy", 8, palette.id, "emotion"), palette.colors[1]);
    const semantic = presentation.getDemographicGenderPalette(palette.id);
    for (const dimension of ["gender", "age-gender"]) assert.deepEqual(presentation.demographicPalettePreviewColors(palette.id, dimension), [semantic.Woman, semantic.Man]);
  }
  assert.deepEqual(OCCUPANCY_COLOR_PALETTES, before);
  assert.deepEqual(presentation.DEMOGRAPHICS_PALETTES.slice(1), OCCUPANCY_COLOR_PALETTES);
});

test("as doze paletas etárias possuem nove tons únicos em progressão estrita do mais jovem claro ao mais velho escuro", () => {
  const original = structuredClone(presentation.DEMOGRAPHICS_PALETTES);
  assert.equal(presentation.DEMOGRAPHICS_PALETTES.length, 12);
  for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
    const colors = presentation.getDemographicAgePalette(id);
    assert.equal(colors.length, AGE_KEYS.length, `${id}: um tom para cada faixa canônica`);
    assert.equal(new Set(colors.map((color) => color.toUpperCase())).size, AGE_KEYS.length, `${id}: faixas diferentes não repetem cores`);
    colors.forEach((color, index) => {
      assert.match(color, /^#[\da-f]{6}$/i, `${id}: preenchimento opaco permite contraste correto`);
      assert.equal(presentation.demographicCategoryColor(AGE_KEYS[index], index, id, "age"), color);
      if (index) assert.ok(luminance(color) < luminance(colors[index - 1]), `${id}: ${AGE_KEYS[index]} deve ser mais escuro que ${AGE_KEYS[index - 1]}`);
    });
    assert.deepEqual(presentation.demographicPalettePreviewColors(id, "age"), colors, `${id}: prévia representa toda a escala efetiva`);
  }
  for (const invalid of [undefined, null, false, {}, [], "missing", "__proto__", "toString"]) {
    assert.deepEqual(presentation.getDemographicAgePalette(invalid), presentation.getDemographicAgePalette("pink-blue"));
  }
  assert.deepEqual(presentation.DEMOGRAPHICS_PALETTES, original, "gerar a escala não modifica as paletas compartilhadas");
});

test("identidade etária depende da chave canônica, não do índice, filtro ou posição ordenada", () => {
  for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
    const expected = presentation.getDemographicAgePalette(id);
    for (const keys of [AGE_KEYS, AGE_KEYS.toReversed(), ["70+", "3-9", "30-39"], ["50-59"]]) {
      keys.forEach((key, index) => {
        for (const position of [index, 0, 8, 100, -1, NaN, Infinity]) {
          assert.equal(presentation.demographicCategoryColor(key, position, id, "age"), expected[AGE_KEYS.indexOf(key)]);
        }
      });
    }
    for (const key of ["unknown", "future", "", "age-unknown", "__proto__", "toString"]) {
      for (const index of [0, 5, 99, -1, NaN]) {
        assert.equal(presentation.demographicCategoryColor(key, index, id, "age"), "#8A99AF", `${id}: faixa desconhecida não herda tom de uma idade válida`);
      }
    }
  }
});

test("todos os formatos preservam a escala etária por chave ao ordenar e filtrar sem mudar contagens ou percentuais", () => {
  const ageItems = AGE_KEYS.map((key, index) => ({ key, label: key, count: (index * 7 + 3) % 11 + 1, percentage: (index * 7 + 3) % 11 + 1, observed: true }));
  const source = [...ageItems, { key: "unknown", label: "Não identificado", count: 2, percentage: 2, observed: true }];
  const before = structuredClone(source);
  const subsets = [source, [source[8], source[1], source[4]], [source[6]], [source[9], source[3]]];
  const formats = [["bar", "horizontal"], ["bar", "vertical"], ["stacked", "horizontal"], ["stacked", "vertical"], ["pie", "horizontal"], ["donut", "horizontal"], ["half-donut", "horizontal"], ["rose", "horizontal"]];
  for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
    const expected = presentation.getDemographicAgePalette(palette);
    for (const [type, orientation] of formats) for (const order of ["default", "ascending", "descending"]) {
      for (const items of subsets) for (const theme of ["light", "dark"]) {
        const option = build(items, { ...presentation.defaultDemographicPresentation("age"), palette, type, orientation, order, emojis: true }, { dimension: "age", theme });
        const data = option.series.flatMap((series) => series.data);
        assert.equal(data.length, items.length, "troca de apresentação não remove categorias");
        for (const point of data) {
          const original = items.find(({ key }) => point.key === key);
          assert.equal(point.itemStyle.color, point.key === "unknown" ? "#8A99AF" : expected[AGE_KEYS.indexOf(point.key)]);
          assert.equal(point.count, original.count);
          assert.equal(point.percentage, original.percentage, "filtrar categorias não renormaliza a participação");
          assert.equal(point.categoryLabel, original.label);
          assert.ok(point.name.startsWith(original.label));
        }
        const ordered = order === "default" ? items : items.toSorted((left, right) => (order === "ascending" ? 1 : -1) * (left.count - right.count));
        assert.deepEqual(data.map((point) => point.key), ordered.map((point) => point.key));
      }
    }
  }
  assert.deepEqual(source, before);
});

test("nome contextual da paleta etária não migra IDs nem altera configurações de visões salvas", () => {
  const id = "demographics_age_distribution";
  for (const palette of presentation.DEMOGRAPHICS_PALETTES) {
    const label = presentation.demographicPaletteLabel(palette.id, "age");
    assert.equal(label, palette.id === "pink-blue" ? "Azul sequencial" : palette.label);
    for (const dimension of ["emotion", "age-emotion"]) {
      assert.equal(presentation.demographicPaletteLabel(palette.id, dimension), palette.label);
    }
    const stored = {
      id, visible: true, title: "Perfil por idade", widthLevel: 4, heightLevel: 2,
      demographics: { ...presentation.defaultDemographicPresentation("age"), palette: palette.id, type: "half-donut", order: "descending", emojis: true },
    };
    const [restored] = normalizeCardPreferences("demographics", JSON.parse(JSON.stringify([stored])), [id]);
    assert.deepEqual(restored.demographics, stored.demographics);
    assert.equal(restored.title, stored.title);
    assert.equal(restored.widthLevel, stored.widthLevel);
    assert.equal(restored.heightLevel, stored.heightLevel);
    assert.equal(restored.demographics.palette, palette.id, "rótulos traduzidos não substituem o ID persistido");
    assert.deepEqual(presentation.demographicPalettePreviewColors(restored.demographics.palette, "age"), presentation.getDemographicAgePalette(palette.id));
  }
});

test("rótulos distinguem categoria, intensidade azul e períodos sem renomear IDs persistidos", () => {
  for (const palette of presentation.DEMOGRAPHICS_PALETTES) {
    for (const dimension of ["gender", "age", "emotion", "age-gender", "age-emotion"]) {
      assert.equal(presentation.demographicPaletteLabel(palette.id, dimension, "category"), presentation.demographicPaletteLabel(palette.id, dimension));
      assert.equal(presentation.demographicPaletteLabel(palette.id, dimension, "intensity"), palette.id === "pink-blue" ? "Azul sequencial" : palette.label);
    }
    for (const dimension of ["gender", "age", "emotion"]) {
      const expected = palette.id !== "pink-blue" ? palette.label : dimension === "gender" ? "Neutros" : "Rosa e neutro";
      assert.equal(presentation.demographicPaletteLabel(palette.id, dimension, "period"), expected);
    }
    assert.equal(presentation.getDemographicPalette(palette.id).id, palette.id);
  }
});

function elements(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children, predicate)];
}

test("controles de distribuição e temporais apresentam as cores efetivas por dimensão", () => {
  for (const dimension of ["gender", "age-gender", "age", "emotion"]) {
    const tree = Controls({ dimension, value: { ...presentation.defaultDemographicPresentation(dimension), palette: "cyber" }, onChange: () => {} });
    const swatches = elements(tree, (node) => node.type?.name === "PaletteSwatches");
    assert.ok(swatches.length > 0);
    assert.deepEqual(swatches[0].props.colors, presentation.demographicPalettePreviewColors("cyber", dimension));
  }
  for (const dimension of ["gender", "age", "emotion"]) {
    const widgetId = "demographics_gender_timeline";
    const tree = TemporalControls({ widgetId, value: { ...defaultDemographicTemporalSettings(widgetId), dimension }, onChange: () => {} });
    for (const { id } of presentation.DEMOGRAPHICS_PALETTES) {
      const item = elements(tree, (node) => node.props.value === id && typeof node.props.textValue === "string")[0];
      const colors = elements(item, (node) => node.props.style?.backgroundColor).map((node) => node.props.style.backgroundColor);
      assert.deepEqual(colors, presentation.demographicPalettePreviewColors(id, dimension).slice(0, dimension === "age" ? 9 : 5));
    }
  }
});

test("seleção, opções e legenda de gênero exibem o nome contextual e os dois HEX efetivos", () => {
  const widgetId = "demographics_gender_timeline";
  for (const [kind, dimension] of [["distribution", "gender"], ["distribution", "age-gender"], ["temporal", "gender"]]) {
    const Component = kind === "distribution" ? Controls : TemporalControls;
    for (const theme of ["light", "dark"]) for (const { id: palette } of presentation.DEMOGRAPHICS_PALETTES) {
      const defaults = kind === "distribution" ? presentation.defaultDemographicPresentation(dimension) : { ...defaultDemographicTemporalSettings(widgetId), dimension, chartType: "area" };
      const value = { ...defaults, palette };
      const changes = [];
      const props = { dimension, widgetId, value, theme, onChange: (next) => changes.push(next) };
      const tree = Component(props);
      const label = presentation.demographicPaletteLabel(palette, dimension);
      const expected = presentation.getDemographicGenderPalette(palette);
      const colors = [expected.Woman, expected.Man];
      const ariaLabel = `${kind === "distribution" ? "Paleta de cores" : "Paleta temporal"}: ${label}`;
      const trigger = elements(tree, (node) => node.props["aria-label"] === ariaLabel)[0];
      assert.ok(trigger, `${kind}/${dimension}/${palette}: nome contextual da seleção`);
      assert.deepEqual(paletteItemColors(trigger), colors, "prévia selecionada usa os HEX reais sem tintas ou opacidade");
      const selection = elements(tree, (node) => node.props.onValueChange && elements(node, (child) => child === trigger).length)[0];
      assert.equal(selection.props.value, palette);
      for (const option of presentation.DEMOGRAPHICS_PALETTES) {
        const item = elements(selection, (node) => node.props.value === option.id && typeof node.props.textValue === "string")[0];
        assert.ok(item);
        assert.equal(item.props.textValue, presentation.demographicPaletteLabel(option.id, dimension));
        const actual = presentation.getDemographicGenderPalette(option.id);
        assert.deepEqual(paletteItemColors(item), [actual.Woman, actual.Man]);
      }
      selection.props.onValueChange(palette);
      assert.equal(changes.at(-1).palette, palette, "o nome contextual não substitui o ID persistido");
      const legend = elements(tree, (node) => node.props["aria-label"] === "Cores por gênero")[0];
      assert.ok(legend);
      assert.deepEqual(paletteItemColors(legend), colors);
      const legendHtml = renderToStaticMarkup(legend);
      assert.match(legendHtml, />Mulher</);
      assert.match(legendHtml, />Homem</);
      assert.doesNotMatch(legendHtml, /Não identificado|opacity:/);
      const html = renderToStaticMarkup(React.createElement(Component, props));
      assert.ok(html.includes(ariaLabel), `${kind}: SSR mantém nome acessível da seleção`);
      for (const color of colors) assert.ok(html.includes(`background-color:${color}`));
    }
  }
});

test("controles exibem Azul sequencial para idade e mantêm o ID original nas seleções", () => {
  for (const kind of ["distribution", "temporal"]) {
    const changes = [];
    const widgetId = "demographics_gender_timeline";
    const defaults = kind === "distribution" ? presentation.defaultDemographicPresentation("age") : { ...defaultDemographicTemporalSettings(widgetId), dimension: "age", chartType: "area" };
    const Component = kind === "distribution" ? Controls : TemporalControls;
    const props = { dimension: "age", widgetId, value: defaults, onChange: (value) => changes.push(value) };
    const tree = Component(props);
    const ariaLabel = `${kind === "distribution" ? "Paleta de cores" : "Paleta temporal"}: Azul sequencial`;
    const selection = elements(tree, (node) => node.props.onValueChange && elements(node, (child) => child.props["aria-label"] === ariaLabel).length)[0];
    assert.ok(selection, `${kind}: título acessível identifica a progressão azul`);
    assert.equal(selection.props.value, "pink-blue");
    for (const palette of presentation.DEMOGRAPHICS_PALETTES) {
      const option = elements(selection, (node) => node.props.value === palette.id && node.props.textValue)[0];
      assert.equal(option.props.textValue, presentation.demographicPaletteLabel(palette.id, "age"));
      selection.props.onValueChange(palette.id);
      assert.equal(changes.at(-1).palette, palette.id);
    }
    const html = renderToStaticMarkup(React.createElement(Component, props));
    assert.match(html, /Azul sequencial/);
    assert.match(html, /Mais jovens → mais velhos · claro → escuro/);
  }
});

test("prévias de heatmap usam sete níveis de intensidade reais, não cores de faixas etárias", () => {
  const { demographicHeatmapColors } = load("lib/demographics-crossing-options.ts");
  for (const theme of ["light", "dark"]) for (const kind of ["distribution", "temporal"]) {
    const widgetId = "demographics_age_hourly";
    const Component = kind === "distribution" ? Controls : TemporalControls;
    const value = kind === "distribution" ? presentation.defaultDemographicPresentation("age-emotion") : { ...defaultDemographicTemporalSettings(widgetId), chartType: "heatmap" };
    const tree = Component({ dimension: "age-emotion", widgetId, value, theme, onChange: () => {} });
    const expectedAriaLabel = `${kind === "distribution" ? "Paleta de cores" : "Paleta temporal"}: Azul sequencial`;
    assert.equal(elements(tree, (node) => node.props["aria-label"] === expectedAriaLabel).length, 1, "matriz azul não deve anunciar Rosa e azul");
    for (const palette of presentation.DEMOGRAPHICS_PALETTES) {
      const option = elements(tree, (node) => node.props.value === palette.id && typeof node.props.textValue === "string")[0];
      assert.ok(option, `${kind}/${theme}: opção ${palette.id} disponível`);
      assert.deepEqual(paletteItemColors(option), demographicHeatmapColors(palette.id, theme));
      assert.equal(paletteItemColors(option).length, 7);
      assert.equal(option.props.textValue, palette.id === "pink-blue" ? "Azul sequencial" : palette.label, "o nome representa a escala real de intensidade");
    }
  }
});

test("prévias de comparação identificam as duas séries de período sem aplicar nove tons etários", () => {
  const { demographicComparisonColors } = load("lib/demographics-comparison-colors.ts");
  const widgetId = "demographics_period_comparison";
  for (const theme of ["light", "dark"]) for (const dimension of ["age", "emotion"]) {
    const value = { ...defaultDemographicTemporalSettings(widgetId), dimension, chartType: "bar" };
    const tree = TemporalControls({ widgetId, value, theme, onChange: () => {} });
    assert.equal(elements(tree, (node) => node.props["aria-label"] === "Paleta temporal: Rosa e neutro").length, 1);
    for (const palette of presentation.DEMOGRAPHICS_PALETTES) {
      const option = elements(tree, (node) => node.props.value === palette.id && typeof node.props.textValue === "string")[0];
      assert.ok(option);
      assert.deepEqual(paletteItemColors(option), demographicComparisonColors(palette.id, dimension, theme));
      assert.equal(paletteItemColors(option).length, 2);
      assert.equal(option.props.textValue, palette.id === "pink-blue" ? "Rosa e neutro" : palette.label);
    }
  }
});

function paletteItemColors(node) {
  const component = elements(node, (candidate) => candidate.type?.name === "PaletteSwatches")[0];
  return component ? component.props.colors : elements(node, (candidate) => candidate.props.style?.backgroundColor).map((candidate) => candidate.props.style.backgroundColor);
}

test("comparativo por gênero explica cores de período e oculta paleta sem efeito preservando escolha", () => {
  const widgetId = "demographics_period_comparison";
  const settings = { ...defaultDemographicTemporalSettings(widgetId), palette: "cyber" };
  const changes = [];
  const tree = TemporalControls({ widgetId, value: settings, onChange: (value) => changes.push(value) });
  const html = renderToStaticMarkup(React.createElement(TemporalControls, { widgetId, value: settings, onChange: () => {} }));
  assert.match(html, /As cores distinguem os períodos comparados, não os gêneros/);
  assert.doesNotMatch(html, /Paleta temporal:/);
  const dimensionSelect = elements(tree, (node) => node.props.onValueChange && elements(node, (child) => child.props["aria-label"] === "Dimensão demográfica").length)[0];
  dimensionSelect.props.onValueChange("age");
  assert.equal(changes[0].palette, "cyber");
  const changed = renderToStaticMarkup(React.createElement(TemporalControls, { widgetId, value: changes[0], onChange: () => {} }));
  assert.match(changed, /Paleta temporal: Cyber/);
});
