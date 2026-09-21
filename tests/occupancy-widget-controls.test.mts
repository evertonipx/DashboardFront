// Dynamic fixtures intentionally cross injected-module and malformed-input boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const layoutSource = readFileSync(resolve(root, "components/app/card-layout.tsx"), "utf8");
const dashboardSource = readFileSync(resolve(root, "components/app/occupancy-scenario-dashboard.tsx"), "utf8");
const customWidgetEditorSource = readFileSync(
  resolve(root, "components/app/occupancy-custom-widget-editor.tsx"),
  "utf8",
);
const Button = ({ children, ...props }: RuntimeFixture) => React.createElement("button", { ...props, variant: undefined, size: undefined }, children);
const icon = () => React.createElement("svg");
const classNames = (...values: RuntimeFixture[]) => values.filter(Boolean).join(" ");

test("cada widget usa uma única configuração ancorada à direita, respeitando leitura e reorganização", () => {
  const CardLayoutItem = standalone(layoutSource, "CardLayoutItem", {
    React, Button, Settings2: icon, GripVertical: icon, cn: classNames,
    resolveRequestedCardWidthLevel: () => 3,
    resolveRequestedCardHeightLevel: () => 3,
    resolveCardDimensions: () => ({ widthLevel: 3, heightLevel: 3, tier: "large" }),
    supportedChartTypes: () => [],
    cardLayoutLevelToCardHeight: () => "standard",
    cardLayoutLevelToCardSize: () => "wide",
    cardLayoutItemStyle: () => ({}),
    resolveCardChartType: () => "line",
    WidgetAppearanceProvider: ({ children }: RuntimeFixture) => children,
  });
  const base = {
    card: { id: "occupancy_test", label: "Mapa de ocupação", node: null },
    preference: { title: "Meu mapa" },
    configureEnabled: true, reorderEnabled: false,
    layoutWidth: 1200, placements: { large: { columnStart: 1, rowStart: 1 } },
  };
  const html = renderToStaticMarkup(React.createElement(CardLayoutItem, base));
  assert.equal((html.match(/data-layout-card-configure/g) ?? []).length, 1);
  assert.match(html, /absolute right-2 top-2/);
  assert.match(html, /aria-label="Configurar Meu mapa"/);
  assert.match(html, /aria-haspopup="dialog"/);
  for (const mode of [{ configureEnabled: false }, { reorderEnabled: true }]) {
    const restricted = renderToStaticMarkup(React.createElement(CardLayoutItem, { ...base, ...mode }));
    assert.doesNotMatch(restricted, /data-layout-card-configure/);
  }
});

test("opções específicas ficam no mesmo organizador e ações customizadas não duplicam cabeçalhos", () => {
  assert.match(layoutSource, /configurationContent\?: React\.ReactNode/);
  assert.match(layoutSource, /data-layout-card-options=\{selectedCard\.id\}[\s\S]*?\{selectedCard\.configurationContent\}/);
  const customCards = dashboardSource.slice(
    dashboardSource.indexOf("  const customWidgetCards ="),
    dashboardSource.indexOf("  const detailCards ="),
  );
  assert.match(customCards, /configurationContent/);
  assert.match(customCards, /setLayoutOrganizerOpen\(false\);\s*openCustomWidgetEditor\(widget\)/);
  assert.doesNotMatch(customCards, /action=\{/);
  assert.equal((customCards.match(/configurationContent,/g) ?? []).length, 2);
  assert.match(
    dashboardSource,
    /import \{[\s\S]*?OccupancyCustomWidgetActions[\s\S]*?OccupancyCustomWidgetDialog[\s\S]*?\} from "@\/components\/app\/occupancy-custom-widget-editor"/,
  );
  const OccupancyCustomWidgetActions = standalone(
    customWidgetEditorSource,
    "OccupancyCustomWidgetActions",
    {
    Button, Pencil: icon, Trash2: icon,
    WidgetCardActions: ({ children }: RuntimeFixture) => React.createElement("div", null, children),
    },
  );
  const html = renderToStaticMarkup(
    React.createElement(OccupancyCustomWidgetActions, { title: "Meu widget" }),
  );
  assert.match(html, /Editar conteúdo/);
  assert.match(html, /Remover widget/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
});

test("Contagem e Ocupação usam o mesmo controle genérico e o mesmo seletor de cenários", () => {
  const liveSource = readFileSync(resolve(root, "components/app/realtime-dashboard.tsx"), "utf8");
  for (const source of [liveSource, dashboardSource]) assert.match(source, /showCardConfigurationActions/);
  assert.match(layoutSource, /WidgetScenarioCompositionEditor/);
  assert.match(layoutSource, /WidgetScenarioOrderEditor/);
  assert.match(layoutSource, /data-widget-scenario-order/);
  assert.match(layoutSource, /Ordem de exibição/);
  assert.match(layoutSource, /scenarioOrderingDisabled\?: boolean/);
  assert.match(layoutSource, /scenarioOrder: selectedPreference\?\.scenarioOrder \?\? \[\]/);
  assert.match(layoutSource, /import\("@\/components\/app\/scenario-picker"\)/);
  assert.match(layoutSource, /const canEditLayout = hasVisualAdminAccess\(user\) && !monitorMode/);
});

test("editor compartilhado adapta linguagem e indicadores ao período histórico", () => {
  const reportsSource = readFileSync(
    resolve(root, "components/app/occupancy-reports-dashboard.tsx"),
    "utf8",
  );
  assert.match(reportsSource, /<OccupancyCustomWidgetDialog[\s\S]*?surface="analysis"/);
  assert.match(customWidgetEditorSource, /surface\?: "analysis" \| "live"/);
  assert.match(customWidgetEditorSource, /Última ocupação do período/);
  assert.match(customWidgetEditorSource, /Último dia por minuto/);
  assert.match(customWidgetEditorSource, /disponível somente no Ao Vivo/);
  assert.match(customWidgetEditorSource, /aria-pressed=\{form\.series\[key\]\}/);
});

function standalone(source: RuntimeFixture, name: RuntimeFixture, globals: RuntimeFixture) {
  const tree = ts.createSourceFile("widget.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = tree.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(declaration, `função ${name} existe`);
  const output = ts.transpileModule(`${declaration.getText(tree)}\nexports.result = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, RuntimeFixture> = {};
  new Function("require", "exports", ...Object.keys(globals), output)(require, exports, ...Object.values(globals));
  return exports.result;
}
