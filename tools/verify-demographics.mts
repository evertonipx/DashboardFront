/** Real demographic cards/EChart fixture; no authentication or production API.
 * Run: node --import tsx tools/verify-demographics.mts [--screenshots] [--temporal|--circular] [--case=label-regex] [--palette=ID]
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig.js";
import { browserPageUrl, bundleBrowserFixture, compileBrowserFunctions, connectCdp, delay, evaluate as evaluateInBrowser, serverPort, waitFor, type CdpClient } from "./lib/browser-check.mts";
import type { DemographicPresentation } from "../lib/demographics-presentation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export type FixtureParts = { cards: string; declarations: string; temporalCards?: string };
type FixtureCase = { theme: string; width: number; compact?: boolean; preset: string; period?: string };
export type TextBounds = { text: string; x: number; y: number; right: number; bottom: number; polygon?: number[][]; color?: string; font?: string; fontSize?: string | number };
export type AxisLabel = TextBounds & { axisIndex?: number; axisType?: string; axisPosition?: string; rawText?: string };
export type CategoryMark = { key: string; color: string; opacity?: number; seriesIndex?: number; dataIndex?: number };
export type GenderCategoryColors = { marks: CategoryMark[]; areas: CategoryMark[]; legends: CategoryMark[]; labels?: Array<{ text: string; color: string; background: string; backplate?: boolean }> };
export type CircularSector = { radius: number; innerRadius: number; centerX: number; centerY: number; startAngle: number; endAngle: number; clockwise?: boolean };
export type CircularSlice = CircularSector & { name: string; key?: string; count: number; percentage: number; color?: string; labelSpans: TextBounds[]; labelText: string; labelPosition?: string; guideVisible: boolean; guidePoints: number[][] };
export type CircularLayout = { series: Array<{ slices: CircularSlice[]; diameter: number }>; legendEnabled: boolean; legendItems: Array<Omit<TextBounds, "text"> & { name: string; color?: string; expectedText: string; renderedText: string; spans: TextBounds[] }>; background?: string };
type CircularLegendLayout = {
  series: Array<{ diameter: number; slices: Array<Pick<CircularSlice, "name" | "count" | "percentage" | "color">> }>;
  legendEnabled: boolean;
  legendItems: Array<Pick<CircularLayout["legendItems"][number], "name" | "color" | "expectedText" | "renderedText" | "spans">>;
};
type TextOverlap = { first: string; second: string; overlapX: number; overlapY: number };
type Rect = { x: number; y: number; right: number; bottom: number; width: number; height: number };
type ScrollWidth = { scrollWidth: number; clientWidth: number };
type ControlMenu = ScrollWidth & { x: number; right: number; options: number };
type ControlBounds = Rect & ScrollWidth & { controls: Array<Rect & ScrollWidth & { label: string }>; menus?: ControlMenu[] };
type ChartMeasurement = {
  width: number; height: number; decal?: boolean; colors: unknown[];
  series: Array<{ type: string; decal: boolean; points: number; startAngle?: number; endAngle?: number; roseType?: unknown }>;
  texts: TextBounds[]; categories: string[]; yAxisLabels: AxisLabel[];
  ageCategoryColors: CategoryMark[]; circularLayout?: CircularLayout;
  widgetId: string; previewColors: string[]; genderCategoryColors: GenderCategoryColors;
  genderPaletteIssues?: string[]; agePaletteIssues?: string[]; categoryLabelOverlaps?: TextOverlap[];
  yAxisLabelBounds?: AxisLabel[]; circularLegendIssues?: string[]; circularSliceLabelIssues?: string[];
  circularLabelOverlaps?: TextOverlap[]; numericLabelOverlaps?: TextOverlap[];
};
type FixtureMeasurement = {
  pageWidth: number; viewportWidth: number;
  cards: Array<Rect & ScrollWidth & { id: string; kind: string; background: string; density?: string }>;
  chartViews: Array<Rect & { label: string }>;
  titleBounds: Array<Rect & ScrollWidth & { text: string }>;
  charts: ChartMeasurement[]; expectedAgeColors: Record<string, string>;
  expectedGenderColors: Record<"gender" | "matrix" | "temporal", Record<string, string>>;
  browserErrors: string[]; controls?: Array<ControlBounds & { id: string }>;
};

// ECharts exposes these inspection objects at runtime, but not in its public
// chart API. Keep that boundary explicit instead of leaking dynamic values
// through the geometry/color assertions below.
type InspectionRect = { x: number; y: number; width: number; height: number; clone(): InspectionRect; applyTransform(matrix: number[] | null): void };
type InspectionElement = {
  type: string; anid?: string; __legendDataIndex?: number;
  style: { text: string; fill: string; stroke?: string; opacity?: number; font?: string; fontSize?: string | number };
  shape: { points?: number[][] }; parent?: InspectionElement;
  childrenRef(): InspectionElement[]; traverse(callback: (element: InspectionElement) => void): void;
  getBoundingRect(): InspectionRect; getComputedTransform(): number[] | null;
  contain(x: number, y: number): boolean;
  getTextContent(): InspectionElement | null; getTextGuideLine(): InspectionElement | null;
};
type InspectionModel = { componentIndex: number; get(path: string | string[]): string };
type InspectionLegendModel = InspectionModel & { getData(): InspectionModel[] };
type InspectionData = {
  count(): number; getRawDataItem(index: number): { key: string; count: number; percentage: number; [index: number]: number };
  getItemGraphicEl(index: number): InspectionElement | undefined; getName(index: number): string;
  getItemLayout(index: number): { r: number; r0: number; cx: number; cy: number; startAngle: number; endAngle: number; clockwise: boolean };
  getItemVisual(index: number, kind: "style"): { fill: string }; getItemModel(index: number): InspectionModel;
};
type InspectionSeries = { name: string; seriesIndex: number; subType: string; option: { areaStyle?: unknown }; getData(): InspectionData };
type InspectionChart = {
  getZr(): { storage: { getDisplayList(): InspectionElement[] } };
  getModel(): {
    eachComponent(kind: "yAxis", callback: (model: InspectionModel) => void): void;
    eachComponent(kind: "legend", callback: (model: InspectionLegendModel) => void): void;
    eachSeries(callback: (model: InspectionSeries) => void): void;
    getSeriesByName(name: string): InspectionSeries[];
  };
  getViewOfComponentModel(model: InspectionModel): { group: InspectionElement; getContentGroup(): InspectionElement };
  getViewOfSeriesModel(model: InspectionSeries): { group: InspectionElement };
  getDom(): HTMLElement | null; getOption(): { backgroundColor?: string | null };
};

export function demographicFixtureParts(source: string): FixtureParts {
  const ast = ts.createSourceFile("demographics.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let cards: string | undefined;
  let temporalCards: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "cards" && node.initializer && ts.isCallExpression(node.initializer)) {
      cards = node.initializer.arguments[0].getText(ast);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "allCards" && node.initializer && ts.isCallExpression(node.initializer)) {
      temporalCards = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(cards, "The production card definition must remain available.");
  const declarations = ast.statements.filter((node) =>
    ts.isVariableStatement(node) || (ts.isFunctionDeclaration(node) && node.name?.text !== "DemographicsDashboard"),
  ).map((node) => node.getText(ast)).join("\n");
  return { cards, declarations, temporalCards };
}

export const demographicFixtureRows = ["Woman", "Man", "unknown"].flatMap((gender, genderIndex) =>
  ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"].flatMap((age_bucket, ageIndex) =>
    ["neutral", "happy", "surprise", "sad", "angry", "disgust", "fear", "contempt"].map((emotion, emotionIndex) => ({
      bucket: "2026-09-10T13:00:00Z", camera_id: `fixture-camera-${genderIndex + 1}`,
      gender, age_bucket, emotion,
      count: (ageIndex + emotionIndex + genderIndex) % 7 === 0 ? 0 : (9 - ageIndex) * (8 - emotionIndex) * (genderIndex === 2 ? 1 : 3),
    })),
  ),
);

// Each preset exercises several real chart variants, without changing the source data.
export const demographicFixturePresets: Record<string, Record<string, Partial<DemographicPresentation>>> = {
  default: {},
  circular: {
    gender: { type: "half-donut" },
    age: { type: "pie", order: "descending" },
    emotion: { type: "rose", order: "ascending" },
  },
  circularAlternate: {
    gender: { type: "pie" },
    age: { type: "donut" },
    emotion: { type: "half-donut", emojis: true },
  },
  vertical: {
    gender: { type: "bar", orientation: "vertical", order: "ascending" },
    age: { type: "bar", orientation: "vertical", order: "ascending" },
    emotion: { type: "bar", orientation: "vertical", order: "ascending" },
  },
  symbols: {
    gender: { type: "bar", order: "descending", emojis: true },
    age: { type: "bar", order: "descending" },
    emotion: { type: "bar", order: "descending", emojis: true },
    "age-gender": { order: "descending", emojis: true },
    "age-emotion": { order: "ascending", emojis: true },
  },
  stacked: {
    gender: { type: "stacked", orientation: "vertical" },
    age: { type: "stacked", orientation: "horizontal", order: "descending" },
    emotion: { type: "stacked", orientation: "vertical", emojis: true },
  },
  cyber: {
    gender: { type: "donut", palette: "cyber" },
    age: { type: "bar", orientation: "vertical", palette: "cyber" },
    emotion: { type: "pie", emojis: true, palette: "cyber" },
    "age-gender": { palette: "cyber" },
    "age-emotion": { palette: "cyber" },
  },
};

export const demographicFixtureCases: FixtureCase[] = [
  ...["light", "dark"].flatMap((theme) =>
    [{ width: 320 }, { width: 390 }, { width: 768 }, { width: 1440 }, { width: 320, compact: true }, { width: 1440, compact: true }]
      .map((layout) => ({ theme, ...layout, preset: "default" })),
  ),
  ...Object.keys(demographicFixturePresets).filter((preset) => preset !== "default").flatMap((preset) =>
    ["light", "dark"].flatMap((theme) => [320, 1440].map((width) => ({ theme, width, compact: true, preset }))),
  ),
];

export const demographicCircularFixtureCases: FixtureCase[] = ["circular", "circularAlternate", "cyber"].flatMap((preset) =>
  ["light", "dark"].flatMap((theme) => [320, 768, 1440].flatMap((width) =>
    [false, true].map((compact) => ({ theme, width, compact, preset })))),
);

function fixtureSource(parts: FixtureParts) {
  return `
import React from "react";
import { createRoot } from "react-dom/client";
import { Activity, CalendarRange, HeartPulse, Settings2, UsersRound } from "lucide-react";
import { getInstanceByDom } from "echarts/core";
import { CompactMetricCard } from "@/components/app/compact-metric-card";
import { EChart } from "@/components/app/echart";
import { DemographicsWidgetControls } from "@/components/app/demographics-widget-controls";
import { DemographicsTemporalControls } from "@/components/app/demographics-temporal-controls";
import { DemographicsTemporalWidget } from "@/components/app/demographics-temporal-widget";
import { useTheme } from "@/components/app/theme-provider";
import { WidgetAppearanceProvider, WidgetTitleText, useWidgetColor } from "@/components/app/widget-appearance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { heatmapLabelColor, monochromeHeatmapPalette } from "@/lib/chart-palette";
import { AGE_LABELS, aggregateDemographicBuckets } from "@/lib/demographics";
import { visibleDemographicDistribution, visibleDemographicCrossing } from "@/lib/demographics-visible-categories";
import { buildDemographicDistributionOption, fitDemographicCompositionOption } from "@/lib/demographics-chart-options";
import { buildDemographicCrossingOption, demographicHeatmapColors, demographicHeatmapLabelColor } from "@/lib/demographics-crossing-options";
import { demographicComparisonColors } from "@/lib/demographics-comparison-colors";
import { DEMOGRAPHICS_TEMPORAL_WIDGET_IDS, normalizeDemographicTemporalSettings } from "@/lib/demographics-temporal-preferences";
import { buildDemographicTemporalModel } from "@/lib/demographics-temporal-chart-options";
import { demographicCategoryColor, demographicCategoryLabel, demographicDimensionForCard, demographicPalettePreviewColors, defaultDemographicPresentation, getDemographicGenderPalette, getDemographicPalette, normalizeDemographicPresentation } from "@/lib/demographics-presentation";
import { cn, formatNumber } from "@/lib/utils";
import { packCardLayout } from "@/lib/card-layout-packing";
import { resolveCardLayoutDimensions, CARD_LAYOUT_ROW_HEIGHT, CARD_LAYOUT_ROW_GAP } from "@/lib/card-layout-sizing";
${parts.declarations}
const query = new URLSearchParams(location.search);
window.__fixtureCase = query.get("case");
const temporal = query.get("temporal") === "1";
const monthly = query.get("period") === "month";
const temporalFrom = new Date(monthly ? "2026-08-01T03:00:00Z" : "2026-09-10T03:00:00Z");
const temporalTo = new Date(monthly ? "2026-09-01T03:00:00Z" : "2026-09-11T03:00:00Z");
const temporalNow = new Date("2026-09-10T21:00:00Z");
const sourceRows = ${JSON.stringify(demographicFixtureRows)};
const temporalRows = Array.from({ length: monthly ? 31 : 1 }, (_, day) => Array.from({ length: monthly ? 24 : 18 }, (_, hour) =>
  sourceRows.filter((_, index) => index % 5 === 0).map(row => ({...row, bucket:new Date(temporalFrom.getTime() + day*86400000 + hour*3600000).toISOString(), count:Math.round(row.count*(1+(hour%5)*0.3+(day%4)*0.2))})))).flat(2);
const summary = aggregateDemographicBuckets(temporal ? temporalRows : sourceRows, { timeZone:"America/Sao_Paulo" });
const compact = query.get("compact") === "1";
const basePreset = ${JSON.stringify(demographicFixturePresets)}[query.get("preset") || "default"] || {};
const paletteOverride = query.get("palette");
if (paletteOverride && getDemographicPalette(paletteOverride).id !== paletteOverride) throw Error("Unknown fixture palette: " + paletteOverride);
const preset = Object.fromEntries(["gender","age","emotion","age-gender","age-emotion"].map(dimension => [dimension, {...basePreset[dimension], ...(paletteOverride ? {palette:paletteOverride} : {})}]));
window.__fixtureAgeColors = Object.fromEntries(AGE_LABELS.map((key,index) => [key, demographicCategoryColor(key,index,normalizeDemographicPresentation(preset.age,"age").palette,"age")]));
window.__fixtureGenderColors = { gender:getDemographicGenderPalette(preset.gender.palette), matrix:getDemographicGenderPalette(preset['age-gender'].palette), temporal:getDemographicGenderPalette(paletteOverride) };
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");
window.__chartInstances = () => [...document.querySelectorAll('[data-echart] [_echarts_instance_]')].map(e => getInstanceByDom(e)).filter(Boolean);
function Fixture() {
  const rootRef = React.useRef(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const update = () => setWidth(rootRef.current.clientWidth);
    update(); const observer = new ResizeObserver(update); observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);
  const loading = false;
  const effectiveTheme = query.get("theme") === "dark" ? "dark" : "light";
  const genderLeader = leadingDistributionItem(visibleDemographicDistribution(summary.gender, "gender"));
  const ageLeader = leadingDistributionItem(summary.age);
  const emotionLeader = leadingDistributionItem(summary.emotion);
  const [widgetPresentations, setWidgetPresentations] = React.useState(() => Object.fromEntries([
    ["demographics_gender_mix", "gender"], ["demographics_age_distribution", "age"],
    ["demographics_emotion_distribution", "emotion"], ["demographics_age_gender_pyramid", "age-gender"],
    ["demographics_age_emotion_heatmap", "age-emotion"],
  ].map(([id, dimension]) => [id, normalizeDemographicPresentation(preset[dimension], dimension)])));
  const updateWidgetPresentation = (id, value) => setWidgetPresentations(current => ({ ...current, [id]: value }));
  const [temporalSettings, setTemporalSettings] = React.useState(() => Object.fromEntries(DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.map(id => [id, normalizeDemographicTemporalSettings(paletteOverride ? {palette:paletteOverride} : undefined,id)])));
  const updateTemporalSettings = (id, value) => setTemporalSettings(current => ({...current, [id]:value}));
  const temporalModels = React.useMemo(() => Object.fromEntries(DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.map(id => [id, buildDemographicTemporalModel({id,summary,comparisonSummary:summary,comparisonLabel:"Período anterior (simulado)",settings:temporalSettings[id],from:temporalFrom,to:temporalTo,timeZone:"America/Sao_Paulo",now:temporalNow,theme:query.get("theme")})])), [temporalSettings]);
  const comparisonLoading = false;
  const comparisonError = undefined;
  const [configurationCardId, setConfigurationCardId] = React.useState(null);
  const cards = (${parts.cards})();
  const allCards = temporal ? (${parts.temporalCards ?? "() => cards"})() : cards;
  const configurationCard = allCards.find(card => card.id === configurationCardId);
  const dimensions = allCards.map(card => ({ id: card.id, ...resolveCardLayoutDimensions({
    condensed: card.condensed, containerWidth: width,
    heightLevel: compact && card.previewKind !== "metric" ? 1 : card.defaultHeightLevel,
    widthLevel: compact && card.previewKind !== "metric" ? 3 : card.defaultWidthLevel,
  }) }));
  const placements = packCardLayout(dimensions, dimensions[0].columnCount);
  React.useEffect(() => { window.__fixtureReady = width > 0; window.__fixtureWidth = width; }, [width]);
  return <main className="min-w-0 p-4">
    <div className="mb-4"><h1 className="text-lg font-semibold">Demográfico · Análises</h1><p className="text-xs text-muted-foreground">Fixture visual com dados sintéticos · 10/09/2026 · {compact ? "Widgets compactos" : "Layout padrão"}</p></div>
    <div ref={rootRef} className="min-w-0" style={{ display:'grid', gap:CARD_LAYOUT_ROW_GAP, gridAutoRows:CARD_LAYOUT_ROW_HEIGHT, gridTemplateColumns:'repeat('+dimensions[0].columnCount+', minmax(0,1fr))' }}>
      {placements.map(placement => { const card=allCards.find(candidate=>candidate.id===placement.id); const dimension=dimensions.find(candidate=>candidate.id===card.id); return <section key={card.id}
        data-fixture-widget={card.id} data-fixture-kind={card.previewKind === 'metric' ? 'metric' : 'chart'}
        data-fixture-preview-colors={JSON.stringify(card.previewColors || [])}
        data-layout-card-id={card.id} data-layout-card-height-level={dimension.heightLevel}
        data-layout-card-density={card.condensed ? 'condensed' : 'standard'} data-layout-card-width-level={dimension.widthLevel}
        data-layout-card-dimension-range="1-6" data-layout-card-column-start={placement.columnStart} data-layout-card-row-start={placement.rowStart}
        className="relative min-h-0 min-w-0 [&_[data-card-header]]:pr-14 [&_[data-compact-metric-header]]:pr-12" style={{gridColumn:placement.columnStart+' / span '+placement.columnSpan,gridRow:placement.rowStart+' / span '+placement.rowSpan}}>
        <Button type="button" variant="outline" size="icon" className="absolute right-2 top-2 z-30 h-8 w-8 shrink-0 bg-card/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground" aria-label={'Configurar '+card.label} data-layout-card-configure title="Configurar widget" onClick={() => setConfigurationCardId(card.id)}><Settings2 className="h-4 w-4" /></Button>
        <WidgetAppearanceProvider>{card.node}</WidgetAppearanceProvider>
      </section>; })}
    </div>
    <Dialog open={Boolean(configurationCard)} onOpenChange={open => { if (!open) setConfigurationCardId(null); }}>
      <DialogContent data-fixture-controls>
        <DialogHeader><DialogTitle>{configurationCard?.label}</DialogTitle><DialogDescription>Personalize a leitura deste widget.</DialogDescription></DialogHeader>
        {configurationCard?.configurationContent}
      </DialogContent>
    </Dialog>
  </main>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
`;
}

async function main() {
  const chromePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
  assert.ok(chromePath, "Chrome is required (or set CHROME_PATH).");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ipxdata-demographics-"));
  const screenshots = process.argv.includes("--screenshots") ? join(root, "artifacts", "responsive-current") : null;
  const casePattern = process.argv.find((argument) => argument.startsWith("--case="))?.slice("--case=".length);
  const caseFilter = casePattern ? new RegExp(casePattern) : null;
  const temporal = process.argv.includes("--temporal");
  const circular = process.argv.includes("--circular");
  const palette = process.argv.find((argument) => argument.startsWith("--palette="))?.slice("--palette=".length);
  if (palette) assert.match(palette, /^[a-z][a-z_-]*$/, "Use a canonical palette ID.");
  const cases = temporal ? ["day", "month"].flatMap((period) => ["light", "dark"].flatMap((theme) =>
    [320, 1440].flatMap((width) => [false, true].map((compact) => ({ period, theme, width, compact, preset: "default" }))))) : circular ? demographicCircularFixtureCases : demographicFixtureCases;
  const chartCount = temporal ? 10 : 5;
  let chrome: ChildProcess | undefined;
  let server: Server | undefined;
  let cdp: CdpClient | undefined;
  const failures: string[] = [];
  const results: unknown[] = [];
  const browserFunctions = compileBrowserFunctions(await readFile(fileURLToPath(import.meta.url), "utf8"), ["collectYAxisLabels", "collectCircularLayout", "collectAgeCategoryColors", "collectGenderCategoryColors"]);
  try {
    const parts = demographicFixtureParts(await readFile(join(root, "components/app/demographics-dashboard.tsx"), "utf8"));
    const source = fixtureSource(parts);
    const syntax = ts.transpileModule(source, { fileName: "fixture.tsx", reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    const syntaxErrors = (syntax.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.equal(syntaxErrors.length, 0, syntaxErrors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
    const entryPath = join(temporaryRoot, "fixture.tsx");
    const themePath = join(temporaryRoot, "theme.ts");
    await writeFile(entryPath, source);
    await writeFile(themePath, `export function useTheme() { const effectiveTheme=new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light';return { effectiveTheme, theme:effectiveTheme }; }`);
    await bundleBrowserFixture(root, entryPath, join(temporaryRoot, "fixture.js"), { "@/components/app/theme-provider": themePath });
    const config = loadConfig(join(root, "tailwind.config.ts"));
    config.content = [join(root, "components/**/*.{ts,tsx}"), { raw: source, extension: "tsx" }];
    const css = await postcss([tailwindcss(config)]).process(await readFile(join(root, "app/globals.css"), "utf8"), { from: join(root, "app/globals.css") });
    await writeFile(join(temporaryRoot, "fixture.css"), css.css);
    await writeFile(join(temporaryRoot, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    server = createServer(async (request, response) => {
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const filename = path === "/" ? "index.html" : basename(path);
      if (path !== "/" && (path !== `/${filename}` || !/\.(js|css)$/.test(filename))) { response.writeHead(404).end(); return; }
      try { response.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html"); response.end(await readFile(join(temporaryRoot, filename))); }
      catch { response.writeHead(404).end(); }
    });
    await new Promise<void>((resolveListen) => server!.listen(0, "127.0.0.1", resolveListen));
    const profile = join(temporaryRoot, "chrome-profile");
    chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
    await waitFor(() => existsSync(join(profile, "DevToolsActivePort")), "disposable Chrome");
    const debugPort = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
    cdp = await connectCdp(await browserPageUrl(debugPort));
    await cdp.send("Page.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__fixtureBrowserErrors=[];
      window.addEventListener('error',event=>window.__fixtureBrowserErrors.push(event.error?.stack || event.message));
      window.addEventListener('unhandledrejection',event=>window.__fixtureBrowserErrors.push(String(event.reason)));
      const originalConsoleError=console.error;
      console.error=(...args)=>{window.__fixtureBrowserErrors.push(args.map(String).join(' '));originalConsoleError(...args);};
    ` });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const evaluate = <T = unknown,>(expression: string) => evaluateInBrowser<T>(cdp!, expression);
    for (const { theme, width, compact, preset, period } of cases) {
        const label = `${theme}-${width}${compact ? "-compact" : ""}${preset === "default" ? "" : `-${preset}`}${temporal ? `-temporal-${period}` : ""}${palette ? `-palette-${palette}` : ""}`;
        if (caseFilter && !caseFilter.test(label)) continue;
        await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        const targetUrl = `http://127.0.0.1:${serverPort(server)}/?theme=${theme}&compact=${compact ? 1 : 0}&preset=${preset}&case=${label}&temporal=${temporal ? 1 : 0}&period=${period ?? "day"}${palette ? `&palette=${encodeURIComponent(palette)}` : ""}`;
        await cdp.send("Page.navigate", { url: targetUrl });
        await waitFor(() => evaluate(`(() => { if (window.__fixtureCase !== ${JSON.stringify(label)}) return false; if (window.__fixtureBrowserErrors?.length) throw Error(window.__fixtureBrowserErrors.join('\\n')); return location.href === ${JSON.stringify(targetUrl)} && Boolean(window.__fixtureReady) && Math.abs(window.__fixtureWidth - document.querySelector('main > .min-w-0').clientWidth) < 1; })()`), `${label} React fixture`).catch(async (error) => {
          console.error(await evaluate("window.__fixtureBrowserErrors"));
          throw error;
        });
        for (let index = 0; index < chartCount; index++) {
          await evaluate(`document.querySelectorAll('[data-echart]')[${index}].scrollIntoView({block:'center'})`);
          await waitFor(() => evaluate(`document.querySelectorAll('[data-echart]')[${index}].getAttribute('aria-busy') === 'false'`), `${label} chart ${index}`);
        }
        await evaluate("window.scrollTo(0,0)");
        await delay(180);
        const measurement = await evaluate<FixtureMeasurement>(`(() => {
          const readYAxisLabels = ${browserFunctions.collectYAxisLabels};
          const readCircularLayout = ${browserFunctions.collectCircularLayout};
          const readAgeColors = ${browserFunctions.collectAgeCategoryColors};
          const readGenderColors = ${browserFunctions.collectGenderCategoryColors};
          const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
          const cards=[...document.querySelectorAll('[data-fixture-widget]')].map(e=>({id:e.dataset.fixtureWidget,kind:e.dataset.fixtureKind,...rect(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,background:getComputedStyle(e.querySelector('[data-demographics-density],[data-compact-metric-card]')).backgroundImage,density:e.querySelector('[data-demographics-density]')?.dataset.demographicsDensity}));
          const chartViews=[...document.querySelectorAll('[data-echart]')].map(e=>({label:e.getAttribute('aria-label'),...rect(e)}));
          const titleBounds=[...document.querySelectorAll('[data-fixture-widget] h3')].map(e=>({text:e.textContent,...rect(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
          const charts=window.__chartInstances().map(chart=>{const option=chart.getOption();const texts=chart.getZr().storage.getDisplayList().filter(e=>e.type==='tspan').map(e=>{const r=e.getBoundingRect().clone();const m=e.getComputedTransform();const polygon=[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]].map(([x,y])=>m?[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]:[x,y]);r.applyTransform(m);return {text:e.style.text,x:r.x,y:r.y,right:r.x+r.width,bottom:r.y+r.height,polygon,font:e.style.font,fontSize:e.style.fontSize,color:e.style.fill}});const categories=[...(option.yAxis||[]),...(option.xAxis||[])].filter(axis=>axis.type==='category').flatMap(axis=>axis.data||[]);return {width:chart.getWidth(),height:chart.getHeight(),decal:option.aria?.decal?.show,colors:option.series.flatMap(s=>[s.itemStyle?.color,...s.data.map(d=>d?.itemStyle?.color)]).filter(Boolean),series:option.series.map(s=>({type:s.type,decal:Boolean(s.itemStyle?.decal),points:s.data.length,startAngle:s.startAngle,endAngle:s.endAngle,roseType:s.roseType})),texts,categories,yAxisLabels:readYAxisLabels(chart)}});
          window.__chartInstances().forEach((chart,index)=>{charts[index].ageCategoryColors=readAgeColors(chart);if(charts[index].series.some(series=>series.type==='pie'))charts[index].circularLayout=readCircularLayout(chart)});
          window.__chartInstances().forEach((chart,index)=>{const card=chart.getDom().closest('[data-fixture-widget]');charts[index].widgetId=card.dataset.fixtureWidget;charts[index].previewColors=JSON.parse(card.dataset.fixturePreviewColors);charts[index].genderCategoryColors=readGenderColors(chart)});
          return {pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,cards,chartViews,titleBounds,charts,expectedAgeColors:window.__fixtureAgeColors,expectedGenderColors:window.__fixtureGenderColors,browserErrors:window.__fixtureBrowserErrors};
        })()`);
        const check = (condition: unknown, message: string) => { if (!condition) failures.push(`${label}: ${message}`); };
        check(measurement.pageWidth <= width + 1, "page overflows horizontally");
        check(measurement.cards.length === (temporal ? 14 : 9), "all configured widgets render");
        check(measurement.cards.filter((card) => card.kind === "metric").length === 4, "four KPIs render");
        check(measurement.charts.length === chartCount, "all real ECharts render");
        for (const chart of measurement.charts) {
          const kind = chart.widgetId === "demographics_gender_mix" ? "gender" : chart.widgetId === "demographics_age_gender_pyramid" ? "matrix" : chart.widgetId === "demographics_gender_timeline" || chart.widgetId === "demographics_daily_evolution" ? "temporal" : null;
          if (!kind) continue;
          chart.genderPaletteIssues = genderCategoryColorIssues(chart.genderCategoryColors, measurement.expectedGenderColors[kind], chart.previewColors);
          check(new Set(chart.genderCategoryColors.marks.map(mark => mark.key)).size === 2, `${chart.widgetId} renders both identified genders with positive data`);
          for (const issue of chart.genderPaletteIssues) check(false, `${chart.widgetId}: ${issue}`);
        }
        check(!measurement.browserErrors.length, `browser errors: ${measurement.browserErrors.join("; ")}`);
        check(measurement.charts.every((chart) => !chart.texts.some(({ text }) => /Não identificado/.test(text))), "unidentified gender is absent from rendered charts and legends");
        const ageChart = measurement.charts[1];
        ageChart.agePaletteIssues = ageCategoryColorIssues(ageChart.ageCategoryColors, measurement.expectedAgeColors);
        check(new Set(ageChart.ageCategoryColors.map((item) => item.key)).size === 9, "all nine age categories have real rendered colors");
        for (const issue of ageChart.agePaletteIssues) check(false, issue);
        if (width === 1440) check(measurement.cards.slice(0, 4).every((card) => card.y === measurement.cards[0].y), "desktop KPIs share one row");
        for (const card of measurement.cards) {
          check(card.x >= -1 && card.right <= width + 1 && card.scrollWidth <= card.clientWidth + 1, `${card.id} overflows its width`);
          check(card.background === "none", `${card.id} has a background texture`);
        }
        for (const [index, chart] of measurement.charts.entries()) {
          check(chart.width > 100 && chart.height >= 35, "chart has insufficient drawing area");
          check(Math.abs(chart.width - measurement.chartViews[index].width) <= 1, "chart renderer width follows its actual viewport");
          check(chart.decal !== true && chart.series.every((series) => !series.decal), "chart still enables a decal/pattern");
          chart.categoryLabelOverlaps = overlappingTexts(chart.texts.filter((text) => chart.categories.includes(text.text)));
          check(!chart.categoryLabelOverlaps.length, `${measurement.chartViews[index].label} has ${chart.categoryLabelOverlaps.length} overlapping category labels`);
          chart.yAxisLabelBounds = clippedYAxisLabels(chart.yAxisLabels, chart.width);
          for (const axisLabel of chart.yAxisLabelBounds) {
            check(false, `${measurement.chartViews[index].label}: Y-axis ${axisLabel.axisIndex} label ${JSON.stringify(axisLabel.text)} exceeds the canvas (x=${axisLabel.x.toFixed(3)}, right=${axisLabel.right.toFixed(3)}, width=${chart.width})`);
          }
          if (chart.series.some((series) => series.type === "pie")) {
            assert.ok(chart.circularLayout, "A circular chart must expose its measured slice layout.");
            chart.circularLegendIssues = circularLegendIssues(chart.circularLayout, chart.width, chart.height);
            for (const issue of chart.circularLegendIssues) check(false, `${measurement.chartViews[index].label}: ${issue}`);
            chart.circularSliceLabelIssues = circularSliceLabelIssues(chart.circularLayout, chart.width, chart.height);
            for (const issue of chart.circularSliceLabelIssues) check(false, `${measurement.chartViews[index].label}: ${issue}`);
            const visibleText = chart.texts.filter((text) => String(text.text).trim());
            for (const text of visibleText) {
              const fontSize = Number(text.fontSize) || Number(String(text.font).match(/([\d.]+)px/)?.[1]);
              check(!fontSize || fontSize >= 9, `circular chart label ${text.text} is smaller than 9px`);
              check(text.x >= -1 && text.y >= -1 && text.right <= chart.width + 1 && text.bottom <= chart.height + 1, `circular chart label ${text.text} exceeds the canvas`);
            }
            const overlaps = overlappingTexts(visibleText);
            chart.circularLabelOverlaps = overlaps;
            check(!overlaps.length, `circular chart has ${overlaps.length} overlapping labels`);
          }
          if (chart.series.some((series) => series.type === "heatmap")) {
            const numbers = chart.texts.filter((text) => /^\d+(?:[,.]\d+)?%?$/.test(String(text.text)));
            const overlaps = overlappingTexts(numbers);
            for (const first of numbers) {
              check(first.x >= -1 && first.y >= -1 && first.right <= chart.width + 1 && first.bottom <= chart.height + 1, `heatmap label ${first.text} exceeds the canvas`);
            }
            chart.numericLabelOverlaps = overlaps;
            check(!overlaps.length, `heatmap has ${overlaps.length} overlapping numeric labels`);
          }
        }
        if (screenshots) {
          await mkdir(screenshots, { recursive: true });
          const dimensions = await evaluate<{ width: number; height: number }>("({width:innerWidth,height:document.documentElement.scrollHeight})");
          // Expanding the capture internally can transiently reflow responsive
          // grids before their ResizeObservers update ECharts. Size the actual
          // viewport first and wait for layout/renderers to agree.
          await cdp.send("Emulation.setDeviceMetricsOverride", { ...dimensions, deviceScaleFactor: 1, mobile: false });
          await evaluate("window.scrollTo(0,0)");
          await delay(200);
          await waitFor(() => evaluate(`(() => {
            if (Math.abs(window.__fixtureWidth - document.querySelector('main > .min-w-0').clientWidth) >= 1) return false;
            const views=[...document.querySelectorAll('[data-echart]')];
            return window.__chartInstances().every((chart,index)=>Math.abs(chart.getWidth()-views[index].getBoundingClientRect().width)<=1);
          })()`), `${label} stable screenshot layout`);
          const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          await writeFile(join(screenshots, `demographics-${label}.png`), Buffer.from(shot.data, "base64"));
          await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
          await delay(100);
        }
        if (preset === "default" && compact) {
          measurement.controls = [];
          for (const id of temporal ? ["demographics_gender_timeline", "demographics_emotion_hourly", "demographics_age_hourly", "demographics_daily_evolution", "demographics_period_comparison"] : ["demographics_gender_mix", "demographics_age_distribution", "demographics_emotion_distribution", "demographics_age_gender_pyramid", "demographics_age_emotion_heatmap"]) {
            await evaluate(`document.querySelector('[data-fixture-widget="${id}"] [data-layout-card-configure]').click()`);
            await waitFor(() => evaluate("Boolean(document.querySelector('[data-fixture-controls]'))"), `${label} ${id} settings`);
            await delay(200);
            const controlBounds = await evaluate<ControlBounds>(`(() => {
              const dialog=document.querySelector('[data-fixture-controls]');
              const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
              return {...rect(dialog),scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,controls:[...dialog.querySelectorAll('button,input,select,[role="combobox"]')].map(e=>({...rect(e),label:e.getAttribute('aria-label')||e.textContent,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}))};
            })()`);
            check(controlBounds.x >= -1 && controlBounds.right <= width + 1 && controlBounds.scrollWidth <= controlBounds.clientWidth + 1, `${id} settings overflow horizontally`);
            check(controlBounds.controls.length > 1, `${id} settings render real presentation controls`);
            for (const control of controlBounds.controls) {
              check(control.x >= controlBounds.x - 1 && control.right <= controlBounds.right + 1, `${id} setting ${control.label} exceeds the dialog`);
            }
            controlBounds.menus = [];
            for (let menuIndex = 0; menuIndex < 2; menuIndex++) {
              await evaluate(`(() => {const trigger=document.querySelectorAll('[data-fixture-controls] [role="combobox"]')[${menuIndex}];trigger.focus();trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));})()`);
              await waitFor(() => evaluate("Boolean(document.querySelector('[role=\"listbox\"]'))"), `${label} ${id} select ${menuIndex}`);
              await delay(100);
              const menu = await evaluate<ControlMenu>(`(() => {const e=document.querySelector('[role="listbox"]');const r=e.getBoundingClientRect();return {x:r.x,right:r.right,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,options:e.querySelectorAll('[role="option"]').length};})()`);
              check(menu.x >= -1 && menu.right <= width + 1 && menu.scrollWidth <= menu.clientWidth + 1, `${id} select ${menuIndex} overflows horizontally`);
              check(menu.options >= (temporal ? 2 : 3), `${id} select ${menuIndex} exposes its choices`);
              controlBounds.menus.push(menu);
              await evaluate("document.querySelector('[role=\"listbox\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
              await waitFor(() => evaluate("!document.querySelector('[role=\"listbox\"]')"), `${label} ${id} closing select ${menuIndex}`);
            }
            measurement.controls.push({ id, ...controlBounds });
            await evaluate("[...document.querySelectorAll('[data-fixture-controls] button')].find(e=>e.textContent==='Fechar').click()");
            await waitFor(() => evaluate("!document.querySelector('[data-fixture-controls]')"), `${label} closing settings`);
          }
          measurement.browserErrors = await evaluate<string[]>("window.__fixtureBrowserErrors");
          check(!measurement.browserErrors.length, `browser errors after configuring widgets: ${measurement.browserErrors.join("; ")}`);
        }
        results.push({ label, ...measurement });
        console.log(`${failures.some((failure) => failure.startsWith(`${label}:`)) ? "FAIL" : "PASS"} ${label}: 4 KPIs / ${chartCount} charts`);
    }
    if (!results.length) failures.push("No visual cases matched the selected filter; no charts were verified.");
    if (screenshots) await writeFile(join(screenshots, `demographics${temporal ? "-temporal" : circular ? "-circular" : ""}${palette ? `-palette-${palette}` : ""}-report.json`), JSON.stringify({ scope: "real presentation components; synthetic data; no authenticated routes", results, failures }, null, 2));
    console.log(JSON.stringify({ cases: results.length, failures, screenshots }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    cdp?.close();
    if (chrome && chrome.exitCode === null) { chrome.kill(); await Promise.race([new Promise<void>((resolveExit) => chrome!.once("exit", () => resolveExit())), delay(2000)]); }
    if (server) await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
    const target = resolve(temporaryRoot);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("ipxdata-demographics-"));
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

// AxisBuilder identifies tick labels with `label_*`; selecting their rendered
// spans through the Y-axis view avoids confusing repeated category names on X,
// legends, axis names, hidden labels, or data labels with actual Y-axis labels.
// This function is also serialized into the isolated browser fixture.
export function collectYAxisLabels(chartValue: unknown): AxisLabel[] {
  const chart = chartValue as InspectionChart;
  const rendered = new Set(chart.getZr().storage.getDisplayList());
  const labels: AxisLabel[] = [];
  chart.getModel().eachComponent("yAxis", (axisModel) => {
    const view = chart.getViewOfComponentModel(axisModel);
    view.group.traverse((element) => {
      if (element.type !== "text" || !String(element.anid).startsWith("label_")) return;
      for (const span of element.childrenRef()) {
        if (span.type !== "tspan" || !rendered.has(span) || !String(span.style.text).trim()) continue;
        const rect = span.getBoundingRect().clone();
        rect.applyTransform(span.getComputedTransform());
        labels.push({
          axisIndex: axisModel.componentIndex,
          axisType: axisModel.get("type"),
          axisPosition: axisModel.get("position"),
          text: span.style.text,
          rawText: element.style.text,
          x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height,
        });
      }
    });
  });
  return labels;
}

export function clippedYAxisLabels<T extends { x: number; right: number }>(labels: T[], width: number): T[] {
  return labels.filter((label) => label.x < 0 || label.right > width);
}

/** Read rendered category marks, not option palette positions or legend swatches. */
export function collectGenderCategoryColors(chartValue: unknown): GenderCategoryColors & { labels: NonNullable<GenderCategoryColors["labels"]> } {
  const chart = chartValue as InspectionChart;
  const rendered = new Set(chart.getZr().storage.getDisplayList());
  const keyFor = (value: unknown) => typeof value === "string" && /^(Woman|Mulher)(?:\s|$)/.test(value) ? "Woman"
    : typeof value === "string" && /^(Man|Homem)(?:\s|$)/.test(value) ? "Man" : null;
  const marks: CategoryMark[] = [], areas: CategoryMark[] = [], legends: CategoryMark[] = [];
  const labels: NonNullable<GenderCategoryColors["labels"]> = [], polygons: InspectionElement[] = [];
  chart.getModel().eachSeries((model) => {
    const data = model.getData();
    for (let index = 0; index < data.count(); index++) {
      const datum = data.getRawDataItem(index);
      const key = keyFor(datum?.key) || keyFor(model.name);
      const count = Array.isArray(datum) ? datum[3] : datum?.count;
      if (!key || !(count > 0)) continue;
      const graphic = data.getItemGraphicEl(index);
      const candidates = graphic ? [graphic] : [];
      graphic?.traverse?.((element) => candidates.push(element));
      const mark = candidates.find((element) => rendered.has(element) && typeof element.style?.fill === "string" && !["none", "transparent"].includes(element.style.fill));
      if (mark) marks.push({ key, color: model.subType === "line" && mark.style.stroke && mark.style.stroke !== "none" ? mark.style.stroke : mark.style.fill, opacity: mark.style.opacity ?? 1, seriesIndex: model.seriesIndex, dataIndex: index });
    }
    const key = keyFor(model.name);
    if (key && model.subType === "line" && model.option.areaStyle) {
      chart.getViewOfSeriesModel(model).group.traverse((element) => {
        if (rendered.has(element) && /polygon/i.test(element.type)) {
          areas.push({ key, color: element.style.fill, opacity: element.style.opacity ?? 1 });
          polygons.push(element);
        }
      });
    }
  });
  chart.getModel().eachComponent("legend", (model) => {
    if (!model.get("show")) return;
    const data = model.getData();
    const view = chart.getViewOfComponentModel(model);
    for (const group of view.getContentGroup().childrenRef()) {
      if (group.__legendDataIndex == null) continue;
      const key = keyFor(data[group.__legendDataIndex]?.get("name"));
      if (!key) continue;
      const lineLegend = chart.getModel().getSeriesByName(data[group.__legendDataIndex]?.get("name")).some((series) => series.subType === "line");
      const candidates: Array<{ color: string; opacity: number }> = [];
      group.traverse((element) => {
        if (!rendered.has(element) || element.type === "tspan") return;
        // Line icons contain a stroked path whose unused default fill is black.
        const color = lineLegend && element.style?.stroke && element.style.stroke !== "none" ? element.style.stroke : element.style?.fill;
        if (color && !["none", "transparent"].includes(color)) candidates.push({ color, opacity: element.style.opacity ?? 1 });
      });
      const icon = candidates.find((element) => !["#fff", "#ffffff", "white"].includes(String(element.color).toLowerCase())) || candidates[0];
      if (icon) legends.push({ key, ...icon });
    }
  });
  if (polygons.length) {
    let background = "#FFFFFF";
    for (let element = chart.getDom(); element && typeof getComputedStyle === "function"; element = element.parentElement) {
      const color = getComputedStyle(element).backgroundColor;
      if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") { background = color; break; }
    }
    for (const span of rendered) {
      if (span.type !== "tspan" || !/^\d+(?:[,.]\d+)?%?$/.test(String(span.style.text))) continue;
      const rect = span.getBoundingRect().clone(); rect.applyTransform(span.getComputedTransform());
      const centerX = rect.x + rect.width / 2, centerY = rect.y + rect.height / 2;
      const backplate = span.parent?.childrenRef?.().find((element) => rendered.has(element) && element.type === "rect" && typeof element.style?.fill === "string" && !["none", "transparent"].includes(element.style.fill) && (element.style.opacity ?? 1) === 1 && element.contain(centerX, centerY));
      const under = [...polygons].reverse().find((element) => element.contain(centerX, centerY));
      labels.push({ text: span.style.text, color: span.style.fill, background: backplate?.style.fill || under?.style.fill || background, backplate: Boolean(backplate) });
    }
  }
  return { marks, areas, legends, labels };
}

export function genderCategoryColorIssues(actual: GenderCategoryColors, expected: Record<string, string>, preview: string[] = []): string[] {
  const issues: string[] = [];
  for (const kind of ["marks", "areas", "legends"] as const) for (const item of actual[kind]) {
    if (chartTextContrast(item.color, expected[item.key]) !== 1) issues.push(`${kind} ${item.key} rendered ${item.color} instead of ${expected[item.key]}`);
    if (item.opacity !== 1) issues.push(`${kind} ${item.key} fades its selected color with opacity ${item.opacity}`);
  }
  for (const key of ["Woman", "Man"]) {
    if (!preview.some((color) => chartTextContrast(color, expected[key]) === 1)) issues.push(`preview does not contain the selected ${key} color ${expected[key]}`);
  }
  for (const label of actual.labels || []) {
    const contrast = chartTextContrast(label.color, label.background);
    if (contrast != null && contrast < 4.5) issues.push(`area label ${label.text} contrast ${contrast.toFixed(2)}:1 against ${label.background} is below 4.5:1`);
  }
  return issues;
}

export function collectAgeCategoryColors(chartValue: unknown): CategoryMark[] {
  const chart = chartValue as InspectionChart;
  const keys = ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"];
  const rendered = new Set(chart.getZr().storage.getDisplayList());
  const colors: CategoryMark[] = [];
  chart.getModel().eachSeries((model) => {
    // Heatmaps encode value intensity, not the ordinal age category.
    if (!["bar", "pie", "line"].includes(model.subType)) return;
    const data = model.getData();
    for (let index = 0; index < data.count(); index++) {
      const datum = data.getRawDataItem(index);
      const key = keys.includes(datum?.key) ? datum.key : keys.includes(model.name) ? model.name : null;
      if (!key) continue;
      const graphic = data.getItemGraphicEl(index);
      const candidates = graphic ? [graphic] : [];
      graphic?.traverse?.((element) => candidates.push(element));
      const mark = candidates.find((element) => rendered.has(element) && typeof element.style?.fill === "string" && !["none", "transparent"].includes(element.style.fill));
      // ECharts' default line marker is hollow: the semantic color is its
      // rendered outline, while its fill is intentionally white.
      if (mark) colors.push({ key, color: model.subType === "line" && mark.style.stroke && mark.style.stroke !== "none" ? mark.style.stroke : mark.style.fill, seriesIndex: model.seriesIndex, dataIndex: index });
    }
  });
  return colors;
}

export function ageCategoryColorIssues(actual: CategoryMark[], expected: Record<string, string>): string[] {
  const issues: string[] = [];
  const byKey = new Map<string, string>();
  for (const item of actual) {
    if (chartTextContrast(item.color, expected[item.key]) !== 1) issues.push(`age ${item.key} rendered ${item.color} instead of its stable category color ${expected[item.key]}`);
    if (byKey.has(item.key) && chartTextContrast(item.color, byKey.get(item.key)) !== 1) issues.push(`age ${item.key} changes color between rendered marks`);
    byKey.set(item.key, item.color);
  }
  let previous: number | null | undefined;
  for (const key of ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"]) {
    if (!byKey.has(key)) continue;
    // Against black, contrast increases monotonically with relative luminance.
    const luminanceRank = chartTextContrast(byKey.get(key), "#000000");
    if (luminanceRank == null || (previous != null && luminanceRank >= previous)) issues.push(`age ${key} breaks the canonical light-to-dark progression`);
    previous = luminanceRank;
  }
  return issues;
}

// Match real legend item groups and pie marks by name, not sorted position.
// The rendered spans also reveal truncation hidden by valid bounds.
export function collectCircularLayout(chartValue: unknown): CircularLayout {
  const chart = chartValue as InspectionChart;
  const rendered = new Set(chart.getZr().storage.getDisplayList());
  const bounds = (element: InspectionElement) => {
    const rect = element.getBoundingRect().clone();
    rect.applyTransform(element.getComputedTransform());
    return { x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
  };
  const textSpan = (element: InspectionElement): TextBounds => {
    const rect = element.getBoundingRect();
    const matrix = element.getComputedTransform();
    const polygon = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]]
      .map(([x, y]) => matrix ? [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]] : [x, y]);
    return { text: element.style.text, color: element.style.fill, font: element.style.font, fontSize: element.style.fontSize, polygon, ...bounds(element) };
  };
  const series: CircularLayout["series"] = [];
  chart.getModel().eachSeries((model) => {
    if (model.subType !== "pie") return;
    const data = model.getData();
    const slices: CircularSlice[] = [];
    for (let index = 0; index < data.count(); index++) {
      const datum = data.getRawDataItem(index);
      const layout = data.getItemLayout(index);
      const graphic = data.getItemGraphicEl(index);
      const label = graphic?.getTextContent();
      const guide = graphic?.getTextGuideLine();
      const guideMatrix = guide?.getComputedTransform();
      const labelSpans = label?.childrenRef().filter((element) => element.type === "tspan" && rendered.has(element)).map(textSpan) || [];
      const guideVisible = Boolean(guide && rendered.has(guide) && guide.style.opacity !== 0);
      slices.push({
        name: data.getName(index), key: datum.key, count: datum.count, percentage: datum.percentage,
        color: data.getItemVisual(index, "style")?.fill,
        radius: layout?.r, innerRadius: layout?.r0, centerX: layout?.cx, centerY: layout?.cy,
        startAngle: layout?.startAngle, endAngle: layout?.endAngle, clockwise: layout?.clockwise,
        labelSpans, labelText: labelSpans.map((span) => span.text).join("\n"),
        labelPosition: data.getItemModel(index).get(["label", "position"]),
        guideVisible,
        guidePoints: guideVisible && guide ? (guide.shape.points || []).map(([x, y]) => guideMatrix ? [guideMatrix[0] * x + guideMatrix[2] * y + guideMatrix[4], guideMatrix[1] * x + guideMatrix[3] * y + guideMatrix[5]] : [x, y]) : [],
      });
    }
    series.push({ slices, diameter: Math.max(0, ...slices.map((slice) => slice.radius || 0)) * 2 });
  });
  const legendItems: CircularLayout["legendItems"] = [];
  let legendEnabled = false;
  chart.getModel().eachComponent("legend", (model) => {
    if (!model.get("show")) return;
    legendEnabled = true;
    const view = chart.getViewOfComponentModel(model);
    const data = model.getData();
    for (const group of view.getContentGroup().childrenRef()) {
      if (group.__legendDataIndex == null) continue;
      const name = data[group.__legendDataIndex]?.get("name");
      const text = group.childrenRef().find((element) => element.type === "text");
      const spans = text?.childrenRef().filter((element) => element.type === "tspan" && rendered.has(element)) || [];
      const icon = group.childrenRef().find((element) => element.type !== "text" && element.style?.fill && element.style.fill !== "transparent");
      legendItems.push({
        name, color: icon?.style.fill, expectedText: text?.style.text || "",
        renderedText: spans.map((span) => span.style.text).join("\n"),
        spans: spans.map((span) => ({ text: span.style.text, ...bounds(span) })),
        ...bounds(group),
      });
    }
  });
  let background = chart.getOption().backgroundColor;
  if (typeof background !== "string" || background === "transparent") background = null;
  for (let element = chart.getDom(); !background && element && typeof getComputedStyle === "function"; element = element.parentElement) {
    const color = getComputedStyle(element).backgroundColor;
    if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") background = color;
  }
  return { series, legendEnabled, legendItems, background: background || "#FFFFFF" };
}

export function sectorContainsPoint([x, y]: number[], slice: CircularSector, margin = 0): boolean {
  const dx = x - slice.centerX;
  const dy = y - slice.centerY;
  const radius = Math.hypot(dx, dy);
  if (radius > slice.radius + margin || radius < (slice.innerRadius || 0) - margin) return false;
  const tau = Math.PI * 2;
  const span = Math.abs(slice.endAngle - slice.startAngle);
  if (span >= tau - 0.000001) return true;
  const normalize = (value: number) => ((value % tau) + tau) % tau;
  const angle = Math.atan2(dy, dx);
  const relative = normalize(slice.clockwise === false ? slice.startAngle - angle : angle - slice.startAngle);
  const angularMargin = margin / Math.max(radius, 1);
  return relative <= span + angularMargin || relative >= tau - angularMargin;
}

export function circularLabelFitsSector(span: Omit<TextBounds, "text">, slice: CircularSector): boolean {
  const polygon = span.polygon || [[span.x, span.y], [span.right, span.y], [span.right, span.bottom], [span.x, span.bottom]];
  const points = [...polygon];
  for (let index = 0; index < polygon.length; index++) {
    const [x, y] = polygon[index];
    const [endX, endY] = polygon[(index + 1) % polygon.length];
    const dx = endX - x;
    const dy = endY - y;
    const t = Math.max(0, Math.min(1, ((slice.centerX - x) * dx + (slice.centerY - y) * dy) / (dx * dx + dy * dy || 1)));
    points.push([x + t * dx, y + t * dy]);
  }
  points.push([polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length, polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length]);
  return points.every((point) => sectorContainsPoint(point, slice, 0.5));
}

export function chartTextContrast(foreground: unknown, background: unknown): number | null {
  const rgb = (color: unknown): number[] | null => {
    if (typeof color !== "string") return null;
    const hex = color.match(/^#([a-f\d]{3}|[a-f\d]{6})$/i)?.[1];
    if (hex) return (hex.length === 3 ? [...hex].map((value) => value.repeat(2)) : hex.match(/../g)!).map((value) => parseInt(value, 16));
    const values = color.match(/^rgba?\(([^)]+)\)$/)?.[1].match(/[\d.]+/g)?.map(Number);
    return values && values.length >= 3 ? values.slice(0, 3) : null;
  };
  const luminance = (channels: number[]) => channels.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const first = rgb(foreground);
  const second = rgb(background);
  if (!first || !second) return null;
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function circularSliceLabelIssues(layout: CircularLayout, width: number, height: number): string[] {
  const issues = [];
  for (const slice of layout.series.flatMap((series) => series.slices)) {
    if (!(slice.percentage > 0 && slice.count > 0)) continue;
    const labels = (slice.labelSpans || []).filter((span) => String(span.text).trim());
    const expected = Number(new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: false }).format(slice.percentage));
    const percentages = [...(slice.labelText || "").matchAll(/(\d+(?:[.,]\d+)?)%/g)].map((match) => Number(match[1].replace(",", ".")));
    if (!labels.length || !percentages.includes(expected)) {
      issues.push(`slice ${JSON.stringify(slice.name)} lacks its visible exact ${expected}% label (legend does not count)`);
      continue;
    }
    const inside = labels.every((span) => circularLabelFitsSector(span, slice));
    if (!inside && (!slice.guideVisible || slice.guidePoints.length < 2)) issues.push(`slice ${JSON.stringify(slice.name)} label is not contained and has no visible attached guide line`);
    if (inside && slice.guideVisible) issues.push(`slice ${JSON.stringify(slice.name)} has an unnecessary guide line for its contained label`);
    if (!inside && slice.guideVisible && !sectorContainsPoint(slice.guidePoints[0], slice, 3)) issues.push(`slice ${JSON.stringify(slice.name)} guide does not start on its own sector`);
    for (const span of labels) {
      if (span.x < -1 || span.y < -1 || span.right > width + 1 || span.bottom > height + 1) issues.push(`slice ${JSON.stringify(slice.name)} label exceeds the canvas`);
      const contrast = chartTextContrast(span.color, inside ? slice.color : layout.background);
      if (contrast !== null && contrast < 4.5) issues.push(`slice ${JSON.stringify(slice.name)} label contrast ${contrast.toFixed(2)}:1 is below 4.5:1`);
    }
  }
  return issues;
}

export function circularLegendIssues(layout: CircularLegendLayout, width: number, height: number): string[] {
  const issues = [];
  const plainText = (value: unknown) => String(value).replace(/\{[^{}|]+\|([^{}]*)\}/g, "$1").replace(/\s/g, "");
  const slices = layout.series.flatMap((series) => series.slices);
  for (const series of layout.series) {
    if (series.slices.some((slice) => slice.count > 0) && series.diameter < 48) {
      issues.push(`circular plot diameter ${series.diameter.toFixed(2)}px is below 48px`);
    }
  }
  if (!layout.legendEnabled) return issues;
  for (const slice of slices) {
    if (!layout.legendItems.some((item) => item.name === slice.name)) issues.push(`circular legend omits ${JSON.stringify(slice.name)}`);
  }
  for (const item of layout.legendItems) {
    const slice = slices.find((candidate) => candidate.name === item.name);
    if (!slice) { issues.push(`circular legend has no matching slice for ${JSON.stringify(item.name)}`); continue; }
    if (String(slice.color).toLowerCase() !== String(item.color).toLowerCase()) issues.push(`circular legend color differs from slice ${JSON.stringify(item.name)}`);
    if (plainText(item.expectedText) !== plainText(item.renderedText)) issues.push(`circular legend truncates ${JSON.stringify(item.name)}: ${JSON.stringify(item.renderedText)}`);
    // Radial legends may intentionally contain only names/colors now that the
    // percentage is required on the actual slice by circularSliceLabelIssues.
    if (slice.percentage > 0 && /\d%/.test(item.renderedText)) {
      const percentages = [...item.renderedText.matchAll(/(\d+(?:[.,]\d+)?)%/g)].map((match) => Number(match[1].replace(",", ".")));
      const expected = Number(new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: false }).format(slice.percentage));
      if (!percentages.includes(expected)) issues.push(`circular legend lacks the exact percentage for ${JSON.stringify(item.name)}`);
    }
    for (const span of item.spans) {
      if (span.x < -0.01 || span.y < -0.01 || span.right > width + 0.01 || span.bottom > height + 0.01) issues.push(`circular legend label ${JSON.stringify(item.name)} exceeds the canvas`);
    }
  }
  return issues;
}

export function overlappingTexts(texts: TextBounds[]): TextOverlap[] {
  const overlaps = [];
  for (let left = 0; left < texts.length; left++) {
    for (let right = left + 1; right < texts.length; right++) {
      const first = texts[left];
      const second = texts[right];
      const overlapX = Math.min(first.right, second.right) - Math.max(first.x, second.x);
      const overlapY = Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y);
      if (overlapX > 1 && overlapY > 1 && (!first.polygon || !second.polygon || polygonsOverlap(first.polygon, second.polygon))) {
        overlaps.push({ first: first.text, second: second.text, overlapX, overlapY });
      }
    }
  }
  return overlaps;
}

// Axis-aligned bounding boxes incorrectly flag parallel, rotated labels.
// Test their actual transformed rectangles with the separating-axis theorem.
function polygonsOverlap(first: number[][], second: number[][]): boolean {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index++) {
      const point = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
      if (!length) continue;
      const normal = [-(next[1] - point[1]) / length, (next[0] - point[0]) / length];
      const projections = [first, second].map((points) => points.map(([x, y]) => x * normal[0] + y * normal[1]));
      const overlap = Math.min(...projections.map((values) => Math.max(...values))) - Math.max(...projections.map((values) => Math.min(...values)));
      if (overlap <= 1) return false;
    }
  }
  return true;
}


if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
