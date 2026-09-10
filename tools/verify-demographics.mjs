/** Real demographic cards/EChart fixture; no authentication or production API.
 * Run: node tools/verify-demographics.mjs [--screenshots] [--temporal|--circular] [--case=label-regex]
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const ts = require("typescript");

export function demographicFixtureParts(source) {
  const ast = ts.createSourceFile("demographics.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let cards;
  let temporalCards;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "cards" && ts.isCallExpression(node.initializer)) {
      cards = node.initializer.arguments[0].getText(ast);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "allCards" && ts.isCallExpression(node.initializer)) {
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
export const demographicFixturePresets = {
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

export const demographicFixtureCases = [
  ...["light", "dark"].flatMap((theme) =>
    [{ width: 320 }, { width: 390 }, { width: 768 }, { width: 1440 }, { width: 320, compact: true }, { width: 1440, compact: true }]
      .map((layout) => ({ theme, ...layout, preset: "default" })),
  ),
  ...Object.keys(demographicFixturePresets).filter((preset) => preset !== "default").flatMap((preset) =>
    ["light", "dark"].flatMap((theme) => [320, 1440].map((width) => ({ theme, width, compact: true, preset }))),
  ),
];

export const demographicCircularFixtureCases = ["circular", "circularAlternate", "cyber"].flatMap((preset) =>
  ["light", "dark"].flatMap((theme) => [320, 768, 1440].flatMap((width) =>
    [false, true].map((compact) => ({ theme, width, compact, preset })))),
);

function fixtureSource(parts) {
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
import { aggregateDemographicBuckets } from "@/lib/demographics";
import { buildDemographicDistributionOption, fitDemographicCompositionOption } from "@/lib/demographics-chart-options";
import { buildDemographicCrossingOption, demographicHeatmapColors } from "@/lib/demographics-crossing-options";
import { DEMOGRAPHICS_TEMPORAL_WIDGET_IDS, normalizeDemographicTemporalSettings } from "@/lib/demographics-temporal-preferences";
import { buildDemographicTemporalModel } from "@/lib/demographics-temporal-chart-options";
import { demographicCategoryColor, demographicCategoryLabel, demographicDimensionForCard, demographicPalettePreviewColors, defaultDemographicPresentation, getDemographicPalette, normalizeDemographicPresentation } from "@/lib/demographics-presentation";
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
const preset = ${JSON.stringify(demographicFixturePresets)}[query.get("preset") || "default"] || {};
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
  const genderLeader = leadingDistributionItem(summary.gender);
  const ageLeader = leadingDistributionItem(summary.age);
  const emotionLeader = leadingDistributionItem(summary.emotion);
  const [widgetPresentations, setWidgetPresentations] = React.useState(() => Object.fromEntries([
    ["demographics_gender_mix", "gender"], ["demographics_age_distribution", "age"],
    ["demographics_emotion_distribution", "emotion"], ["demographics_age_gender_pyramid", "age-gender"],
    ["demographics_age_emotion_heatmap", "age-emotion"],
  ].map(([id, dimension]) => [id, normalizeDemographicPresentation(preset[dimension], dimension)])));
  const updateWidgetPresentation = (id, value) => setWidgetPresentations(current => ({ ...current, [id]: value }));
  const [temporalSettings, setTemporalSettings] = React.useState(() => Object.fromEntries(DEMOGRAPHICS_TEMPORAL_WIDGET_IDS.map(id => [id, normalizeDemographicTemporalSettings(undefined,id)])));
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
  const cases = temporal ? ["day", "month"].flatMap((period) => ["light", "dark"].flatMap((theme) =>
    [320, 1440].flatMap((width) => [false, true].map((compact) => ({ period, theme, width, compact, preset: "default" }))))) : circular ? demographicCircularFixtureCases : demographicFixtureCases;
  const chartCount = temporal ? 10 : 5;
  let chrome;
  let server;
  let cdp;
  const failures = [];
  const results = [];
  try {
    const parts = demographicFixtureParts(await readFile(join(root, "components/app/demographics-dashboard.tsx"), "utf8"));
    const source = fixtureSource(parts);
    const syntax = ts.createSourceFile("fixture.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.equal(syntax.parseDiagnostics.length, 0, syntax.parseDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
    const entryPath = join(temporaryRoot, "fixture.tsx");
    const loaderPath = join(temporaryRoot, "typescript-loader.cjs");
    const themePath = join(temporaryRoot, "theme.ts");
    await writeFile(entryPath, source);
    await writeFile(themePath, `export function useTheme() { const effectiveTheme=new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light';return { effectiveTheme, theme:effectiveTheme }; }`);
    await writeFile(loaderPath, `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;};`);
    const { webpack } = require("next/dist/compiled/webpack/webpack");
    await new Promise((resolveBuild, reject) => {
      const compiler = webpack({
        mode: "development", devtool: false, context: root, entry: entryPath,
        output: { path: temporaryRoot, filename: "fixture.js", publicPath: "/" },
        resolve: { alias: { "@/components/app/theme-provider$": themePath, "@": root }, extensions: [".tsx", ".ts", ".jsx", ".js"], modules: [join(root, "node_modules"), "node_modules"] },
        module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: loaderPath }] },
        optimization: { minimize: false },
        plugins: [new webpack.DefinePlugin({ "process.env.NEXT_PUBLIC_IPXDATA_DEFAULT_COMPANY_TIME_ZONE": JSON.stringify("America/Sao_Paulo") })],
      });
      compiler.run((error, stats) => compiler.close((closeError) => {
        if (error || closeError) return reject(error || closeError);
        if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
        resolveBuild();
      }));
    });
    const config = require("tailwindcss/loadConfig")(join(root, "tailwind.config.ts"));
    config.content = [join(root, "components/**/*.{ts,tsx}"), { raw: source, extension: "tsx" }];
    const css = await require("postcss")([require("tailwindcss")(config)]).process(await readFile(join(root, "app/globals.css"), "utf8"), { from: join(root, "app/globals.css") });
    await writeFile(join(temporaryRoot, "fixture.css"), css.css);
    await writeFile(join(temporaryRoot, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    server = createServer(async (request, response) => {
      const path = new URL(request.url, "http://127.0.0.1").pathname;
      const filename = path === "/" ? "index.html" : basename(path);
      if (path !== "/" && (path !== `/${filename}` || !/\.(js|css)$/.test(filename))) { response.writeHead(404).end(); return; }
      try { response.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html"); response.end(await readFile(join(temporaryRoot, filename))); }
      catch { response.writeHead(404).end(); }
    });
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const profile = join(temporaryRoot, "chrome-profile");
    chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
    await waitFor(() => existsSync(join(profile, "DevToolsActivePort")), "disposable Chrome");
    const debugPort = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    cdp = await connectCdp(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__fixtureBrowserErrors=[];
      window.addEventListener('error',event=>window.__fixtureBrowserErrors.push(event.error?.stack || event.message));
      window.addEventListener('unhandledrejection',event=>window.__fixtureBrowserErrors.push(String(event.reason)));
      const originalConsoleError=console.error;
      console.error=(...args)=>{window.__fixtureBrowserErrors.push(args.map(String).join(' '));originalConsoleError(...args);};
    ` });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const evaluate = async (expression) => {
      const value = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
      return value.result.value;
    };
    for (const { theme, width, compact, preset, period } of cases) {
        const label = `${theme}-${width}${compact ? "-compact" : ""}${preset === "default" ? "" : `-${preset}`}${temporal ? `-temporal-${period}` : ""}`;
        if (caseFilter && !caseFilter.test(label)) continue;
        await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        const targetUrl = `http://127.0.0.1:${server.address().port}/?theme=${theme}&compact=${compact ? 1 : 0}&preset=${preset}&case=${label}&temporal=${temporal ? 1 : 0}&period=${period ?? "day"}`;
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
        const measurement = await evaluate(`(() => {
          const readYAxisLabels = ${collectYAxisLabels.toString()};
          const readCircularLayout = ${collectCircularLayout.toString()};
          const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
          const cards=[...document.querySelectorAll('[data-fixture-widget]')].map(e=>({id:e.dataset.fixtureWidget,kind:e.dataset.fixtureKind,...rect(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,background:getComputedStyle(e.querySelector('[data-demographics-density],[data-compact-metric-card]')).backgroundImage,density:e.querySelector('[data-demographics-density]')?.dataset.demographicsDensity}));
          const chartViews=[...document.querySelectorAll('[data-echart]')].map(e=>({label:e.getAttribute('aria-label'),...rect(e)}));
          const titleBounds=[...document.querySelectorAll('[data-fixture-widget] h3')].map(e=>({text:e.textContent,...rect(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
          const charts=window.__chartInstances().map(chart=>{const option=chart.getOption();const texts=chart.getZr().storage.getDisplayList().filter(e=>e.type==='tspan').map(e=>{const r=e.getBoundingRect().clone();const m=e.getComputedTransform();const polygon=[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]].map(([x,y])=>m?[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]:[x,y]);r.applyTransform(m);return {text:e.style.text,x:r.x,y:r.y,right:r.x+r.width,bottom:r.y+r.height,polygon,font:e.style.font,fontSize:e.style.fontSize,color:e.style.fill}});const categories=[...(option.yAxis||[]),...(option.xAxis||[])].filter(axis=>axis.type==='category').flatMap(axis=>axis.data||[]);return {width:chart.getWidth(),height:chart.getHeight(),decal:option.aria?.decal?.show,colors:option.series.flatMap(s=>[s.itemStyle?.color,...s.data.map(d=>d?.itemStyle?.color)]).filter(Boolean),series:option.series.map(s=>({type:s.type,decal:Boolean(s.itemStyle?.decal),points:s.data.length,startAngle:s.startAngle,endAngle:s.endAngle,roseType:s.roseType})),texts,categories,yAxisLabels:readYAxisLabels(chart)}});
          window.__chartInstances().forEach((chart,index)=>{if(charts[index].series.some(series=>series.type==='pie'))charts[index].circularLayout=readCircularLayout(chart)});
          return {pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,cards,chartViews,titleBounds,charts,browserErrors:window.__fixtureBrowserErrors};
        })()`);
        const check = (condition, message) => { if (!condition) failures.push(`${label}: ${message}`); };
        check(measurement.pageWidth <= width + 1, "page overflows horizontally");
        check(measurement.cards.length === (temporal ? 14 : 9), "all configured widgets render");
        check(measurement.cards.filter((card) => card.kind === "metric").length === 4, "four KPIs render");
        check(measurement.charts.length === chartCount, "all real ECharts render");
        if (preset !== "cyber") {
          check(measurement.charts[0].colors.includes("#DB2777") && measurement.charts[0].colors.includes("#2563EB"), "gender keeps the selected pink/blue colors in the real renderer");
        }
        check(!measurement.browserErrors.length, `browser errors: ${measurement.browserErrors.join("; ")}`);
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
            chart.circularLegendIssues = circularLegendIssues(chart.circularLayout, chart.width, chart.height);
            for (const issue of chart.circularLegendIssues) check(false, `${measurement.chartViews[index].label}: ${issue}`);
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
          const dimensions = await evaluate("({width:innerWidth,height:document.documentElement.scrollHeight})");
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
            const controlBounds = await evaluate(`(() => {
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
              const menu = await evaluate(`(() => {const e=document.querySelector('[role="listbox"]');const r=e.getBoundingClientRect();return {x:r.x,right:r.right,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,options:e.querySelectorAll('[role="option"]').length};})()`);
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
          measurement.browserErrors = await evaluate("window.__fixtureBrowserErrors");
          check(!measurement.browserErrors.length, `browser errors after configuring widgets: ${measurement.browserErrors.join("; ")}`);
        }
        results.push({ label, ...measurement });
        console.log(`${failures.some((failure) => failure.startsWith(`${label}:`)) ? "FAIL" : "PASS"} ${label}: 4 KPIs / ${chartCount} charts`);
    }
    if (screenshots) await writeFile(join(screenshots, temporal ? "demographics-temporal-report.json" : circular ? "demographics-circular-report.json" : "demographics-report.json"), JSON.stringify({ scope: "real presentation components; synthetic data; no authenticated routes", results, failures }, null, 2));
    console.log(JSON.stringify({ cases: results.length, failures, screenshots }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    cdp?.close();
    if (chrome && chrome.exitCode === null) { chrome.kill(); await Promise.race([new Promise((resolveExit) => chrome.once("exit", resolveExit)), delay(2000)]); }
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    const target = resolve(temporaryRoot);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && basename(target).startsWith("ipxdata-demographics-"));
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

// AxisBuilder identifies tick labels with `label_*`; selecting their rendered
// spans through the Y-axis view avoids confusing repeated category names on X,
// legends, axis names, hidden labels, or data labels with actual Y-axis labels.
// This function is also serialized into the isolated browser fixture.
export function collectYAxisLabels(chart) {
  const rendered = new Set(chart.getZr().storage.getDisplayList());
  const labels = [];
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

export function clippedYAxisLabels(labels, width) {
  return labels.filter((label) => label.x < 0 || label.right > width);
}

// Read the real legend item groups and pie data visuals. Matching by name (not
// sorted position or color alone) checks the displayed legend after media/theme
// overrides; the rendered spans also reveal truncation hidden by valid bounds.
export function collectCircularLayout(chart) {
  const rendered = new Set(chart.getZr().storage.getDisplayList());
  const bounds = (element) => {
    const rect = element.getBoundingRect().clone();
    rect.applyTransform(element.getComputedTransform());
    return { x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
  };
  const series = [];
  chart.getModel().eachSeries((model) => {
    if (model.subType !== "pie") return;
    const data = model.getData();
    const slices = [];
    for (let index = 0; index < data.count(); index++) {
      const datum = data.getRawDataItem(index);
      const layout = data.getItemLayout(index);
      slices.push({
        name: data.getName(index), key: datum.key, count: datum.count, percentage: datum.percentage,
        color: data.getItemVisual(index, "style")?.fill,
        radius: layout?.r, centerX: layout?.cx, centerY: layout?.cy,
      });
    }
    series.push({ slices, diameter: Math.max(0, ...slices.map((slice) => slice.radius || 0)) * 2 });
  });
  const legendItems = [];
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
  return { series, legendEnabled, legendItems };
}

export function circularLegendIssues(layout, width, height) {
  const issues = [];
  const plainText = (value) => String(value).replace(/\{[^{}|]+\|([^{}]*)\}/g, "$1").replace(/\s/g, "");
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
    if (slice.percentage > 0) {
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

export function overlappingTexts(texts) {
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
function polygonsOverlap(first, second) {
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

function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
async function waitFor(predicate, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(100); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
  });
  return {
    close: () => socket.close(),
    send: (method, params = {}) => new Promise((resolveCommand, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      pending.set(id, { resolve: resolveCommand, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
