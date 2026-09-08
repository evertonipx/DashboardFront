/**
 * Browser geometry regression check using real shared React components.
 * Run: node tools/verify-responsive.mjs [--screenshots] [--access-only | --focus-only | --forced-colors-only] [--focus-baseline]
 * Optional: CHROME_PATH points to a Chromium-compatible executable.
 * Uses a disposable local fixture/profile, never an authenticated app session.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(projectRoot, "package.json"));
const postcss = require("postcss");
const tailwindcss = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");
const { webpack } = require("next/dist/compiled/webpack/webpack");
const chromePath = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
assert.ok(chromePath && existsSync(chromePath), "Chrome not found; set CHROME_PATH to run this check.");

const temporaryRoot = await mkdtemp(join(tmpdir(), "ipxdata-responsive-"));
let chrome;
let server;
let cdp;
const results = [];
const failures = [];
const screenshotDirectory = process.argv.includes("--screenshots")
  ? join(projectRoot, "artifacts", "responsive-current")
  : null;
let currentTheme = "light";
const accessOnly = process.argv.includes("--access-only");
const forcedColorsOnly = process.argv.includes("--forced-colors-only");
const focusOnly = process.argv.includes("--focus-only") || process.argv.includes("--focus-baseline") || forcedColorsOnly;
const focusBaseline = process.argv.includes("--focus-baseline");

// A compact fixture exercises actual components while staying independent of
// production APIs, tenant permissions, saved preferences, and user data.
const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScenarioPicker } from "@/components/app/scenario-picker";
import { MobileNavigation } from "@/components/app/mobile-navigation";
import { UserAccessGrid } from "@/components/app/user-access-grid";
import { buildUserAccessEditorGroups, userAccessEditorPermissionKeys } from "@/lib/user-access-editor";
import { resolveUserAccessCatalog, createUserAccessPermissionState } from "@/lib/user-access-catalog";

const names = [
  "Estacionamento Shopping — Entrada principal do piso superior / Câmera de acesso aos visitantes e funcionários",
  "Local_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(5),
];
function LongSelect({ compact = false, identifier = "normal-select" }) {
  return <Select defaultValue="0">
    <SelectTrigger id={identifier} className={compact ? "h-8" : ""} aria-label={identifier}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {names.map((name, index) => <SelectItem key={index} value={String(index)}>{name}</SelectItem>)}
    </SelectContent>
  </Select>;
}
function Fixture() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  React.useEffect(() => { window.__responsiveReady = true; }, []);
  return <div className="min-w-0 lg:pl-64">
    <main className="min-w-0 space-y-4 p-4">
      <h1 className="text-xl font-semibold">Responsive component fixture</h1>
      <div className="@container rounded-md border border-border bg-card px-3 py-2 shadow-soft">
        <div data-dashboard-toolbar data-fixture="live-toolbar">
          <div data-toolbar-filters className="basis-[24rem]">
            <div className="w-[8.75rem] min-w-0 max-w-full shrink-0">
              <Select defaultValue="locations"><SelectTrigger className="h-auto min-h-8 w-full min-w-0 bg-card py-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="locations">Locais</SelectItem></SelectContent></Select>
            </div>
            <div className="min-w-0 max-w-md flex-[1_1_14rem]">
              <LongSelect compact identifier="toolbar-select" />
            </div>
          </div>
          <div data-toolbar-actions>
            <span data-toolbar-status className="hidden min-w-0 items-center gap-1 whitespace-nowrap text-[11px] @4xl:inline-flex">Atualizado às 15:30:00</span>
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1" data-fixture="toolbar-buttons">
              {["Exportar PDF", "Exportar Excel", "Análise IA", "Reordenar", "Configurar widgets", "Comparações", "Atualizar"].map((label, index) => <Button key={label} aria-label={label} title={label} size="icon" variant="outline" className="h-8 w-8 shrink-0"><span aria-hidden="true">{index + 1}</span></Button>)}
            </div>
          </div>
        </div>
      </div>
      <Card className="@container" data-fixture="controls">
        <CardHeader><CardTitle>Long scenario and location names</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div id="responsive-grid" className="grid min-w-0 gap-3 @lg:grid-cols-2">
            <LongSelect />
            <LongSelect compact identifier="compact-select" />
          </div>
          <ScenarioPicker mode="custom" selectedIds={["a"]} onModeChange={() => {}} onSelectedIdsChange={() => {}} scenarios={[{ id: "a", name: names[0] }, { id: "b", name: names[1] }]} />
          <Button id="open-dialog" onClick={() => setDialogOpen(true)}>Open configuration</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="first">
            <TabsList aria-label="Administrative sections">
              <TabsTrigger value="first">Empresas e locais cadastrados</TabsTrigger>
              <TabsTrigger value="second">Usuários, permissões e acessos</TabsTrigger>
              <TabsTrigger value="third">Workers e câmeras de processamento</TabsTrigger>
            </TabsList>
            <TabsContent value="first">
              <Table scrollRegionLabel="Fixture wide table">
                <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Worker</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
                <TableBody><TableRow><TableCell className="min-w-64">{names[0]}</TableCell><TableCell className="min-w-64">worker-id-123</TableCell><TableCell><Button>Editar configurações</Button></TableCell></TableRow></TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl" data-fixture="dialog">
          <DialogHeader><DialogTitle>Editar cenário e permissões</DialogTitle><DialogDescription>{names[0]}</DialogDescription></DialogHeader>
          <LongSelect identifier="dialog-select" />
          <div className="space-y-3">{Array.from({ length: 12 }, (_, i) => <p key={i}>{names[0]}</p>)}</div>
          <DialogFooter><Button onClick={() => setDialogOpen(false)}>Cancelar</Button><Button>Salvar cenário</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  </div>;
}
function NavigationFixture() {
  const [pathname, setPathname] = React.useState("/manager/live");
  React.useEffect(() => { window.__responsiveReady = true; }, []);
  const stressLabels = new URLSearchParams(location.search).get("labels") !== "normal";
  const items = ["Ao Vivo", "Análises", "Relatórios", "Auditoria", "Visões", "Workers", "Câmeras", "Locais", "Cenários", ...(stressLabels ? names : ["Superadmin"])];
  return <>
    <MobileNavigation
      pageTitle={stressLabels ? names[0] : "Ao Vivo"}
      companyName={stressLabels ? names[1] : "Shopping JK"}
      userName={stressLabels ? names[0] : "Gestor"}
      userEmail={stressLabels ? "long.email.address.".repeat(5) + "@example.test" : "gestor@example.test"}
      pathname={pathname}
      accountActions={<>
        <Button aria-label="Alternar tema" size="icon" variant="outline" onClick={() => { window.__themeClicks = (window.__themeClicks || 0) + 1; }}>T</Button>
        <Button aria-label="Sair" size="icon" variant="outline" onClick={() => { window.__logoutClicks = (window.__logoutClicks || 0) + 1; }}>S</Button>
      </>}
    >
      {(closeMenu) => items.map((label, index) => <a
        key={index}
        href={"#nav-" + index}
        data-fixture-menu-link
        aria-current={pathname === ("/manager/" + index) ? "page" : undefined}
        className="flex min-w-0 items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-secondary"
        onClick={() => { closeMenu(); setPathname("/manager/" + index); }}
      ><span aria-hidden="true" className="shrink-0">{index + 1}</span><span data-fixture-menu-label className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{label}</span></a>)}
    </MobileNavigation>
    <main id="main-content" tabIndex={-1} className="min-w-0 space-y-4 p-4 lg:pl-72">
      <h1 className="text-xl font-semibold">Mobile navigation fixture</h1>
      <Button id="outside-menu-action" onClick={() => { window.__outsideClicks = (window.__outsideClicks || 0) + 1; }}>Ação da página</Button>
      {Array.from({ length: 8 }, (_, index) => <Card key={index}><CardContent className="pt-4">Conteúdo da página {index + 1}</CardContent></Card>)}
    </main>
  </>;
}
const accessModules = ["counting", "occupancy", "demographics"].map((slug) => ({ id: "fixture-module-" + slug, slug, name: slug, active: true }));
const accessGrants = [
  ["counting", "counting_view"],
  ["counting", "counting_manage_views"],
  ["counting", "counting_manage_workers"],
  ["counting", "counting_manage_cameras"],
  ["counting", "counting_manage_locations"],
  ["counting", "counting_manage_scenarios"],
  ["occupancy", "occupancy_live_view"],
  ["occupancy", "occupancy_analytics_view"],
  ["occupancy", "occupancy_reports_view"],
  ["demographics", "demographics_view"],
  ["demographics", "demographics_live_view"],
  ["demographics", "demographics_manage"],
].map(([family, slug]) => {
  const module = accessModules.find((item) => item.slug === family);
  return { id: "fixture-grant-" + slug, slug, module_id: module.id, module };
});
const accessOptions = resolveUserAccessCatalog(accessGrants, accessModules);
const initialAccessState = createUserAccessPermissionState(accessGrants.filter((grant) => ["counting_view", "occupancy_live_view", "demographics_manage"].includes(grant.slug)), accessOptions);
function UserAccessFixture() {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState(initialAccessState);
  const [disabled, setDisabled] = React.useState(false);
  const groups = buildUserAccessEditorGroups(accessOptions, state);
  const setAccess = (groupId, checked, optionId) => {
    const group = groups.find((candidate) => candidate.id === groupId);
    const keys = userAccessEditorPermissionKeys(group, optionId);
    window.__accessChanges = (window.__accessChanges || 0) + 1;
    setState((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, checked])) }));
  };
  React.useEffect(() => { window.__responsiveReady = true; }, []);
  return <main className="min-w-0 p-4">
    <h1 className="text-xl font-semibold">Acessos do usuário — fixture sem autenticação</h1>
    <Button id="open-access-dialog" onClick={() => setOpen(true)}>Editar usuário</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-fixture="user-access-dialog" className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader><DialogTitle>Editar usuário</DialogTitle><DialogDescription>Shopping JK</DialogDescription></DialogHeader>
        <div data-fixture="user-access-scroll" className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="space-y-1"><p className="text-sm font-medium">Menus e acessos</p><p className="text-xs text-muted-foreground">Escolha individualmente o que este usuário pode acessar e administrar.</p></div>
            <div className="mt-3"><UserAccessGrid
              groups={groups.map((group, index) => index === 3 ? { ...group, description: names[1] } : group)}
              disabled={disabled}
              onOptionChange={(groupId, optionId, checked) => setAccess(groupId, checked, optionId)}
              onGroupChange={(groupId, checked) => setAccess(groupId, checked)}
            /></div>
          </div>
        </div>
        <DialogFooter>
          <Button id="toggle-access-disabled" variant="outline" onClick={() => setDisabled((value) => !value)}>{disabled ? "Desbloquear edição" : "Bloquear edição"}</Button>
          <Button id="save-access" onClick={() => { window.__accessSaved = true; }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}
function FocusControls({ prefix, compact = false }) {
  return <>
    <label className="block min-w-0 space-y-1" data-focus-boundary>
      <span className="block text-xs text-muted-foreground">Nome do menu</span>
      <Input id={prefix + "-input"} data-focus-control="input" defaultValue={names[0]} aria-label={prefix + " nome do menu"} />
    </label>
    {!compact ? <label className="block min-w-0 space-y-1" data-focus-boundary>
      <span className="block text-xs text-muted-foreground">Descrição</span>
      <Textarea id={prefix + "-textarea"} data-focus-control="textarea" defaultValue={names.join(" ")} aria-label={prefix + " descrição"} />
    </label> : null}
    <div className="min-w-0 space-y-1" data-focus-boundary>
      <span className="block text-xs text-muted-foreground">Local e cenário</span>
      <Select defaultValue="0"><SelectTrigger id={prefix + "-select"} data-focus-control="select" aria-label={prefix + " local e cenário"}><SelectValue /></SelectTrigger><SelectContent>{names.map((name, index) => <SelectItem key={index} value={String(index)}>{name}</SelectItem>)}</SelectContent></Select>
    </div>
    {!compact ? <label className="flex min-h-11 min-w-0 items-center gap-3 px-3 py-2" data-focus-boundary>
      <Checkbox id={prefix + "-checkbox"} data-focus-control="checkbox" aria-label={prefix + " incluir cenário"} defaultChecked />
      <span className="min-w-0 text-sm [overflow-wrap:anywhere]">Incluir cenário de acesso principal</span>
    </label> : null}
    {!compact ? <label className="flex min-h-11 min-w-0 items-center gap-3 px-3 py-2" data-focus-boundary>
      <input id={prefix + "-raw-checkbox"} data-focus-control="raw-checkbox" type="checkbox" className="h-4 w-4 shrink-0 accent-primary" aria-label={prefix + " seleção nativa"} defaultChecked />
      <span className="min-w-0 text-sm [overflow-wrap:anywhere]">Seleção nativa dos cenários</span>
    </label> : null}
    <div className="min-w-0" data-focus-boundary><Button id={prefix + "-button"} data-focus-control="button" className="w-full" type="button">Salvar configurações detalhadas de locais e cenários</Button></div>
    {!compact ? <div className="min-w-0" data-focus-boundary><Tabs defaultValue="menus"><TabsList aria-label={prefix + " seções"}>
      <TabsTrigger id={prefix + "-tab"} data-focus-control="tab" value="menus">Menus e acessos do usuário</TabsTrigger>
      <TabsTrigger value="company">Configurações da empresa</TabsTrigger>
    </TabsList></Tabs></div> : null}
  </>;
}
function FocusFixture() {
  const [open, setOpen] = React.useState(false);
  const baseline = new URLSearchParams(location.search).get("baseline") === "true";
  React.useEffect(() => { window.__responsiveReady = true; }, []);
  // Only the diagnostic fixture recreates the old shared field ring (2px ring
  // plus 2px offset). Production components and CSS are never changed here.
  const legacyStyle = baseline ? <style>{'[data-focus-control]:is(input:not([type=checkbox]), textarea, [role=combobox]):focus { outline: none !important; box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring)) !important; }'}</style> : null;
  return <main className="min-w-0 space-y-4 p-4">
    {legacyStyle}
    <h1 className="text-lg font-semibold">Foco dos campos</h1>
    <p className="text-xs text-muted-foreground">{baseline ? "Diagnóstico: reprodução do contorno externo anterior de 4px." : "Controles reais com o estilo atual."}</p>
    <Card><CardHeader><CardTitle>Área rolável</CardTitle></CardHeader><CardContent>
      <div data-fixture="focus-scroll" className="max-h-[26rem] min-w-0 space-y-3 overflow-y-auto"><FocusControls prefix="scroll" /></div>
    </CardContent></Card>
    <div className="@container rounded-md border border-border bg-card p-3"><div data-dashboard-toolbar>
      <div data-toolbar-filters className="min-w-0 flex-1"><FocusControls prefix="toolbar" compact /></div>
    </div></div>
    <Button id="open-focus-dialog" onClick={() => setOpen(true)}>Editar menu em diálogo</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent data-fixture="focus-dialog" className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
      <DialogHeader><DialogTitle>Editar menu</DialogTitle><DialogDescription>Nome e configurações do menu selecionado.</DialogDescription></DialogHeader>
      <div data-fixture="focus-dialog-scroll" className="min-h-0 min-w-0 space-y-3 overflow-y-auto"><FocusControls prefix="dialog" /></div>
      <DialogFooter><Button onClick={() => setOpen(false)}>Cancelar</Button><Button>Salvar menu</Button></DialogFooter>
    </DialogContent></Dialog>
  </main>;
}
const fixture = new URLSearchParams(location.search).get("fixture");
createRoot(document.getElementById("root")).render(fixture === "navigation" ? <NavigationFixture /> : fixture === "user-access" ? <UserAccessFixture /> : fixture === "focus" ? <FocusFixture /> : <Fixture />);
`;

try {
  const entryPath = join(temporaryRoot, "fixture.jsx");
  const loaderPath = join(temporaryRoot, "typescript-loader.cjs");
  await writeFile(entryPath, fixtureSource);
  await writeFile(loaderPath, `const ts = require(${JSON.stringify(require.resolve("typescript"))});
module.exports = function(source) {
  return ts.transpileModule(source, { fileName: this.resourcePath, compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
  }}).outputText;
};`);

  await new Promise((resolveBuild, reject) => {
    const compiler = webpack({
      mode: "development",
      devtool: false,
      context: projectRoot,
      entry: entryPath,
      output: { path: temporaryRoot, filename: "fixture.js" },
      resolve: {
        alias: { "@": projectRoot },
        extensions: [".tsx", ".ts", ".jsx", ".js"],
        modules: [join(projectRoot, "node_modules"), "node_modules"],
      },
      module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: loaderPath }] },
      optimization: { minimize: false },
    });
    compiler.run((error, stats) => {
      compiler.close((closeError) => {
        if (error || closeError) return reject(error || closeError);
        if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
        resolveBuild();
      });
    });
  });

  const config = loadConfig(join(projectRoot, "tailwind.config.ts"));
  config.content = [join(projectRoot, "components/**/*.{ts,tsx}"), { raw: fixtureSource, extension: "jsx" }];
  const css = await postcss([tailwindcss(config)]).process(
    await readFile(join(projectRoot, "app/globals.css"), "utf8"),
    { from: join(projectRoot, "app/globals.css") },
  );
  await writeFile(join(temporaryRoot, "fixture.css"), css.css);
  await writeFile(join(temporaryRoot, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const filename = { "/": "index.html", "/fixture.js": "fixture.js", "/fixture.css": "fixture.css" }[pathname];
    if (!filename) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html");
    response.end(await readFile(join(temporaryRoot, filename)));
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const profilePath = join(temporaryRoot, "chrome-profile");
  chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--remote-debugging-port=0",
    `--user-data-dir=${profilePath}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  await waitFor(async () => existsSync(join(profilePath, "DevToolsActivePort")), "Chrome startup");
  const debugPort = (await readFile(join(profilePath, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  cdp = await connectCdp(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  const pageUrl = `http://127.0.0.1:${server.address().port}/`;

  const browserCases = accessOnly || focusOnly ? [] : ["light", "dark"].flatMap((theme) =>
    [320, 390, 768, 1024, 1280, 1440].map((width) => ({ theme, width })),
  );
  for (const { theme, width } of browserCases) {
    currentTheme = theme;
    const failuresBeforeWidth = failures.length;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const caseUrl = `${pageUrl}?width=${width}&theme=${theme}`;
    await cdp.send("Page.navigate", { url: caseUrl });
    await waitFor(() => evaluate(`Boolean(window.__responsiveReady) && location.href === ${JSON.stringify(caseUrl)}`), `fixture at ${width}px`);
    await evaluate(`document.documentElement.classList.toggle('dark', ${theme === "dark"})`);
    await settle();
    const base = await evaluate(`(() => {
      const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const selects = [...document.querySelectorAll('[data-select-trigger]')].map(element => ({ rect: rect(element), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
      const table = document.querySelector('[aria-label="Fixture wide table"]');
      const tabs = document.querySelector('[role="tablist"]');
      const grid = document.getElementById('responsive-grid');
      const toolbar = document.querySelector('[data-fixture="live-toolbar"]');
      const filters = toolbar.querySelector('[data-toolbar-filters]');
      const actions = toolbar.querySelector('[data-toolbar-actions]');
      return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, selects, table: { rect: rect(table), scrollWidth: table.scrollWidth, clientWidth: table.clientWidth }, tabs: { rect: rect(tabs), scrollWidth: tabs.scrollWidth, clientWidth: tabs.clientWidth }, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, toolbar: { rect: rect(toolbar), filters: rect(filters), actions: rect(actions), buttons: [...toolbar.querySelectorAll('[data-fixture="toolbar-buttons"] button')].map(rect) } };
    })()`);
    check(base.documentWidth <= width + 1, `${width}px: document overflows (${base.documentWidth})`);
    for (const [index, select] of base.selects.entries()) {
      assertInside(select.rect, width, `${width}px select ${index}`);
      check(select.scrollWidth <= select.clientWidth + 1, `${width}px: selected name clipped horizontally`);
      check(select.scrollHeight <= select.clientHeight + 1, `${width}px: selected name clipped vertically`);
    }
    assertInside(base.table.rect, width, `${width}px table region`);
    assertInside(base.tabs.rect, width, `${width}px tabs`);
    assertInside(base.toolbar.rect, width, `${width}px live toolbar`);
    check(base.toolbar.buttons.length === 7, `${width}px: all seven actions remain available`);
    for (const button of base.toolbar.buttons) assertInside(button, width, `${width}px live action`);
    if (width >= 1280) {
      const filtersCenter = base.toolbar.filters.y + base.toolbar.filters.height / 2;
      const actionsCenter = base.toolbar.actions.y + base.toolbar.actions.height / 2;
      check(Math.abs(filtersCenter - actionsCenter) <= 1, `${width}px: live toolbar unnecessarily wraps on desktop`);
      check(base.toolbar.buttons.every((button) => Math.abs(button.y - base.toolbar.buttons[0].y) <= 1), `${width}px: live action buttons span multiple rows`);
    }
    if (width < 768) check(base.table.scrollWidth > base.table.clientWidth, "wide tables must remain locally scrollable");
    check(base.columns === (width < 768 ? 1 : 2), `${width}px: container-query columns`);
    await checkScenarioNames(width, '[data-scenario-picker] [data-scenario-name]', 1);
    if (width === 320 || width === 1280) await screenshot(`${theme}-${width}.png`, true);

    await click("#normal-select");
    await waitFor(() => evaluate("Boolean(document.querySelector('[role=listbox]'))"), "select opens");
    await settle();
    const menu = await evaluate(`(() => { const e = document.querySelector('[role=listbox]'); const r = e.getBoundingClientRect(); return { x: r.x, width: r.width, right: r.right, y: r.y, bottom: r.bottom, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, options: [...e.querySelectorAll('[role=option]')].map(o => ({ text: o.textContent, scrollWidth: o.scrollWidth, clientWidth: o.clientWidth, width: o.getBoundingClientRect().width, children: [...o.children].map(c => ({ width: c.getBoundingClientRect().width, scrollWidth: c.scrollWidth, whiteSpace: getComputedStyle(c).whiteSpace, overflowWrap: getComputedStyle(c).overflowWrap })) })) }; })()`);
    assertInside(menu, width, `${width}px select menu`);
    check(menu.y >= -1 && menu.bottom <= 901, `${width}px: menu exceeds visible height`);
    check(menu.scrollWidth <= menu.clientWidth + 1, `${width}px: menu horizontally clips content`);
    for (const option of menu.options) check(option.scrollWidth <= option.clientWidth + 1, `${width}px: long option clips: ${JSON.stringify(option)}`);
    await key("Escape", "Escape", 27);
    await settle();
    await click('[data-scenario-picker-edit]');
    await waitFor(() => evaluate("Boolean(document.querySelector('[role=dialog] [data-scenario-name]'))"), "scenario selection opens");
    await settle();
    await checkScenarioNames(width, '[role=dialog] [data-scenario-name]', 2);
    await key("Escape", "Escape", 27);
    await settle();
    await click("#open-dialog");
    await waitFor(() => evaluate("Boolean(document.querySelector('[data-fixture=dialog]'))"), "dialog opens");
    await settle();
    const dialog = await evaluate(`(() => { const e = document.querySelector('[data-fixture=dialog]'); const r = e.getBoundingClientRect(); e.scrollTop = e.scrollHeight; const buttons = [...e.querySelectorAll('button')]; const save = buttons.find(b => b.textContent.includes('Salvar cenário')); const b = save.getBoundingClientRect(); return { x: r.x, width: r.width, right: r.right, y: r.y, bottom: r.bottom, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, saveVisible: b.top >= r.top && b.bottom <= r.bottom }; })()`);
    assertInside(dialog, width, `${width}px dialog`);
    check(dialog.y >= 15 && dialog.bottom <= 885, `${width}px: dialog exceeds dynamic viewport cap`);
    check(dialog.scrollWidth <= dialog.clientWidth + 1, `${width}px: dialog content overflows horizontally`);
    check(dialog.saveVisible, `${width}px: dialog save action unreachable after scroll`);
    if (width === 320) await screenshot(`${theme}-${width}-dialog.png`);
    const passed = failuresBeforeWidth === failures.length;
    results.push({ theme, width, passed, columns: base.columns, tableScrolls: base.table.scrollWidth > base.table.clientWidth, toolbarActions: base.toolbar.buttons.length });
    console.log(`${passed ? "PASS" : "FAIL"} ${theme} ${width}px: selected names, dropdown, dialog, tabs, bounded table, container grid, live toolbar`);
  }
  const navigationCases = accessOnly || focusOnly ? [] : ["light", "dark"].flatMap((theme) => [
    ...[320, 390, 768, 1023, 1024].map((width) => ({ theme, width, height: 900 })),
    { theme, width: 768, height: 360 },
  ]);
  for (const { theme, width, height } of navigationCases) {
    currentTheme = theme;
    const failuresBeforeCase = failures.length;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    const caseUrl = `${pageUrl}?fixture=navigation&width=${width}&height=${height}&theme=${theme}`;
    await cdp.send("Page.navigate", { url: caseUrl });
    await waitFor(() => evaluate(`Boolean(window.__responsiveReady) && location.href === ${JSON.stringify(caseUrl)}`), `navigation at ${width}x${height}`);
    await evaluate(`document.documentElement.classList.toggle('dark', ${theme === "dark"})`);
    await settle();
    const label = `${width}x${height} navigation`;
    const closed = await evaluate(`(() => { const trigger = document.querySelector('[aria-label="Abrir menu"]'); const r = trigger?.getBoundingClientRect(); return { triggerVisible: Boolean(r && r.width && r.height), documentWidth: document.documentElement.scrollWidth, panelPresent: Boolean(document.querySelector('[data-mobile-navigation-panel]')) }; })()`);
    check(closed.documentWidth <= width + 1, `${label}: closed header overflows`);
    check(closed.triggerVisible === (width < 1024), `${label}: hamburger visibility follows desktop breakpoint`);
    check(!closed.panelPresent, `${label}: drawer starts closed`);

    if (width < 1024) {
      await evaluate("document.querySelector('[aria-label=\"Abrir menu\"]').focus()");
      await key(" ", "Space", 32);
      await waitFor(() => evaluate("Boolean(document.querySelector('[data-mobile-navigation-panel]'))"), "keyboard opens navigation");
      await settle();
      await checkNavigationGeometry(width, height, label);
      check(await evaluate("document.querySelector('[data-mobile-navigation-panel]').contains(document.activeElement)"), `${label}: opening moves focus into drawer`);
      for (let tab = 0; tab < 15; tab += 1) {
        await key("Tab", "Tab", 9);
        check(await evaluate("document.querySelector('[data-mobile-navigation-panel]').contains(document.activeElement)"), `${label}: Tab focus remains inside drawer`);
      }
      await key("Tab", "Tab", 9, 8);
      check(await evaluate("document.querySelector('[data-mobile-navigation-panel]').contains(document.activeElement)"), `${label}: Shift+Tab focus remains inside drawer`);
      if (width === 320 || height === 360) {
        await evaluate("document.querySelector('[data-fixture-menu-link]').scrollIntoView({block:'start'})");
        await screenshot(`${theme}-menu-${width}x${height}.png`);
      }
      await key("Escape", "Escape", 27);
      await waitForNavigationClosed(label);
      check(await evaluate("document.activeElement?.getAttribute('aria-label') === 'Abrir menu'"), `${label}: Escape restores trigger focus`);

      await click('[aria-label="Abrir menu"]');
      await waitFor(() => evaluate("Boolean(document.querySelector('[data-mobile-navigation-panel]'))"), "pointer opens navigation");
      await settle();
      await click('[aria-label="Fechar menu"]');
      await waitForNavigationClosed(label);

      await click('[aria-label="Abrir menu"]');
      await waitFor(() => evaluate("Boolean(document.querySelector('[data-mobile-navigation-panel]'))"), "navigation reopens for overlay");
      await settle();
      const overlayPoint = await evaluate(`(() => { const r = document.querySelector('[data-mobile-navigation-panel]').getBoundingClientRect(); return { x: r.right + (innerWidth - r.right) / 2, y: innerHeight / 2, available: r.right < innerWidth - 1 }; })()`);
      check(overlayPoint.available, `${label}: overlay remains accessible outside drawer`);
      if (overlayPoint.available) {
        await clickPoint({ x: overlayPoint.x, y: overlayPoint.y });
        await waitForNavigationClosed(label);
      } else {
        await key("Escape", "Escape", 27);
        await waitForNavigationClosed(label);
      }

      await click('[aria-label="Abrir menu"]');
      await waitFor(() => evaluate("Boolean(document.querySelector('[data-mobile-navigation-panel]'))"), "navigation reopens for selection");
      await settle();
      await click('[data-fixture-menu-link]');
      await waitForNavigationClosed(label);
      check(await evaluate("location.hash === '#nav-0'"), `${label}: selecting a destination navigates`);

      await click('[aria-label="Abrir menu"]');
      await waitFor(() => evaluate("Boolean(document.querySelector('[data-mobile-navigation-panel]'))"), "navigation reopens for resize");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1024, height, deviceScaleFactor: 1, mobile: false });
      await waitForNavigationClosed(`${label} after desktop resize`);
      check(await evaluate("document.activeElement?.id === 'main-content'"), `${label}: desktop resize moves focus to visible main content`);
      await assertPageInteractive(`${label} after desktop resize`);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await settle();
      check(!await evaluate("Boolean(document.querySelector('[data-mobile-navigation-panel]'))"), `${label}: resizing back does not reopen drawer`);
    } else {
      await assertPageInteractive(label);
    }
    const passed = failures.length === failuresBeforeCase;
    results.push({ theme, width, height, fixture: "mobile-navigation", passed });
    console.log(`${passed ? "PASS" : "FAIL"} ${theme} ${label}: drawer, focus, dismiss, navigation, breakpoint cleanup`);
  }
  const accessCases = focusOnly ? [] : ["light", "dark"].flatMap((theme) =>
    [320, 375, 768].map((width) => ({ theme, width, height: 900 })),
  );
  for (const { theme, width, height } of accessCases) {
    currentTheme = theme;
    const failuresBeforeCase = failures.length;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    const caseUrl = `${pageUrl}?fixture=user-access&width=${width}&theme=${theme}`;
    await cdp.send("Page.navigate", { url: caseUrl });
    await waitFor(() => evaluate(`Boolean(window.__responsiveReady) && location.href === ${JSON.stringify(caseUrl)}`), "user access fixture");
    await evaluate(`document.documentElement.classList.toggle('dark', ${theme === "dark"})`);
    await click("#open-access-dialog");
    await waitFor(() => evaluate("Boolean(document.querySelector('[data-fixture=user-access-dialog]'))"), "user access dialog opens");
    await settle();
    const label = `${width}px user access`;
    const geometry = await evaluate(`(() => {
      const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom }; };
      const dialog = document.querySelector('[data-fixture=user-access-dialog]');
      const scroll = document.querySelector('[data-fixture=user-access-scroll]');
      const save = document.getElementById('save-access');
      return {
        documentWidth: document.documentElement.scrollWidth, dialog: rect(dialog), scroll: rect(scroll), save: rect(save),
        overflow: [...dialog.querySelectorAll('[data-user-access-group], [data-user-access-option], h3, p, span')].filter(e => {
          const display = getComputedStyle(e).display;
          return e.clientWidth > 0 && display !== 'inline' && !e.classList.contains('sr-only') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
        }).map(e => ({ text: e.textContent, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight })),
        columns: [...dialog.querySelectorAll('[data-user-access-group=module]')].map(e => getComputedStyle(e.querySelector('.grid')).gridTemplateColumns.split(' ').length),
        groupNames: [...dialog.querySelectorAll('[data-user-access-group] h3')].map(e => e.textContent),
        hasUnexpectedIdentifier: /fixture-module-|fixture-grant-|access:/.test(dialog.textContent),
        scrolls: scroll.scrollHeight > scroll.clientHeight,
        unlabeledCheckboxes: [...dialog.querySelectorAll('input[type=checkbox]')].filter(e => !e.getAttribute('aria-label')).length,
      };
    })()`);
    check(geometry.documentWidth <= width + 1, `${label}: document stays within viewport`);
    assertInside(geometry.dialog, width, `${label} dialog`);
    check(geometry.dialog.y >= 15 && geometry.dialog.bottom <= height - 15, `${label}: dialog height is bounded`);
    check(geometry.save.y >= geometry.dialog.y && geometry.save.bottom <= geometry.dialog.bottom, `${label}: save stays visible outside scrolling content`);
    check(geometry.scroll.bottom <= geometry.save.y, `${label}: scrolling content does not overlap footer`);
    check(geometry.scrolls, `${label}: long access content has local vertical scroll`);
    check(geometry.overflow.length === 0, `${label}: labels are not clipped: ${JSON.stringify(geometry.overflow)}`);
    check(geometry.columns.every((count) => count === (width >= 768 ? 3 : 1)), `${label}: expected responsive columns: ${geometry.columns}`);
    check(JSON.stringify(geometry.groupNames) === JSON.stringify(["Contagem", "Ocupação", "Demográfico", "Menus e recursos de gestão"]), `${label}: expected module/menu groups`);
    check(!geometry.hasUnexpectedIdentifier && !geometry.unlabeledCheckboxes, `${label}: checkboxes have user-facing names without grant identifiers`);
    check(await evaluate("document.querySelector('[data-fixture=user-access-dialog]').contains(document.activeElement)"), `${label}: dialog owns keyboard focus`);
    await screenshot(`${theme}-user-access-${width}.png`);

    let state = await readAccessCheckboxes();
    check(state.Contagem.options.every((option) => option.checked && !option.disabled), `${label}: legacy grant marks three linked options`);
    check(state.Ocupação.group.mixed && !state.Ocupação.group.checked, `${label}: granular partial grant sets native indeterminate state`);
    check(state.Demográfico.options.slice(0, 3).every((option) => option.checked && option.disabled), `${label}: management includes and locks the three screens`);

    await click('input[aria-label="Contagem: Ao vivo"]');
    state = await readAccessCheckboxes();
    check(state.Contagem.options.every((option) => !option.checked), `${label}: toggling linked option clears the one shared grant`);
    await click('input[aria-label="Selecionar todos os acessos de Contagem"]');
    state = await readAccessCheckboxes();
    check(state.Contagem.options.every((option) => option.checked), `${label}: group selection restores linked options`);

    await evaluate("document.querySelector('input[aria-label=\"Ocupação: Análises\"]').focus()");
    await key(" ", "Space", 32);
    state = await readAccessCheckboxes();
    check(JSON.stringify(state.Ocupação.options.map((option) => option.checked)) === JSON.stringify([true, true, false]), `${label}: Space toggles only the intended granular screen`);
    await click('input[aria-label="Selecionar todos os acessos de Ocupação"]');
    state = await readAccessCheckboxes();
    check(state.Ocupação.options.every((option) => option.checked), `${label}: mixed group selects all individual grants`);
    await click('input[aria-label="Selecionar todos os acessos de Ocupação"]');
    state = await readAccessCheckboxes();
    check(state.Ocupação.options.every((option) => !option.checked), `${label}: selected group clears all individual grants`);
    check(state.Contagem.options.every((option) => option.checked), `${label}: editing occupancy does not affect counting`);

    await click('input[aria-label="Demográfico: Gestão do módulo"]');
    state = await readAccessCheckboxes();
    check(state.Demográfico.options.every((option) => !option.checked && !option.disabled), `${label}: removing management reveals independent selections`);
    await click('input[aria-label="Demográfico: Acesso conjunto às telas"]');
    state = await readAccessCheckboxes();
    check(state.Demográfico.options.slice(0, 3).every((option) => option.checked), `${label}: broad legacy access covers screens alongside granular grants`);
    check(state.Demográfico.options[0].disabled, `${label}: covered granular screen cannot pretend to revoke broad access`);

    const changes = await evaluate("window.__accessChanges || 0");
    await click("#toggle-access-disabled");
    check(await evaluate("[...document.querySelectorAll('[data-user-access-grid] input')].every(e => e.disabled)"), `${label}: save lock disables all access changes`);
    await click('input[aria-label="Contagem: Ao vivo"]');
    check(await evaluate("window.__accessChanges || 0") === changes, `${label}: disabled checkbox cannot change grants`);
    await click("#toggle-access-disabled");
    await evaluate("document.querySelector('[data-fixture=user-access-scroll]').scrollTop = 100000");
    await settle();
    await screenshot(`${theme}-user-access-${width}-menus.png`);
    await click("#save-access");
    check(await evaluate("Boolean(window.__accessSaved)"), `${label}: footer save is actionable`);
    await key("Escape", "Escape", 27);
    await waitFor(() => evaluate("!document.querySelector('[data-fixture=user-access-dialog]')"), "access dialog closes");
    await settle();
    check(await evaluate("document.body.style.pointerEvents !== 'none' && !document.body.hasAttribute('data-scroll-locked')"), `${label}: dialog cleanup releases page`);
    const passed = failuresBeforeCase === failures.length;
    results.push({ theme, width, height, fixture: "user-access-grid", passed, columns: geometry.columns });
    console.log(`${passed ? "PASS" : "FAIL"} ${theme} ${label}: real catalog/editor, linked/granular grants, tri-state, keyboard, mobile dialog`);
  }
  const highContrastCase = { theme: "light", width: 375, height: 900, forcedColors: true };
  const focusCases = accessOnly ? [] : focusBaseline ? [{ theme: "light", width: 320, height: 900, forcedColors: false }]
    : forcedColorsOnly ? [highContrastCase] : [
      ...["light", "dark"].flatMap((theme) => [320, 375, 768].map((width) => ({ theme, width, height: 900, forcedColors: false }))),
      highContrastCase,
    ];
  for (const { theme, width, height, forcedColors } of focusCases) {
    currentTheme = theme;
    const failuresBeforeCase = failures.length;
    const measurements = [];
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: forcedColors ? "active" : "none" }] });
    const caseUrl = `${pageUrl}?fixture=focus&width=${width}&theme=${theme}&baseline=${focusBaseline}`;
    await cdp.send("Page.navigate", { url: caseUrl });
    await waitFor(() => evaluate(`Boolean(window.__responsiveReady) && location.href === ${JSON.stringify(caseUrl)}`), "focus fixture");
    await evaluate(`document.documentElement.classList.toggle('dark', ${theme === "dark"})`);
    await settle();
    for (const context of ["scroll", "toolbar", "dialog"]) {
      if (context === "dialog") {
        await click("#open-focus-dialog");
        await waitFor(() => evaluate("Boolean(document.querySelector('[data-fixture=focus-dialog]'))"), "focus dialog opens");
        await settle();
      }
      const ids = await evaluate(`Array.from(document.querySelectorAll('[data-focus-control][id^="${context}-"]'), e => e.id)`);
      for (const id of ids) {
        for (const mode of ["keyboard", "pointer"]) {
          await evaluate(`(() => {
            document.activeElement?.blur();
            document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'center'});
          })()`);
          await settle();
          const before = await measureFocus(id);
          if (mode === "keyboard") {
            if (before.kind === "tab") {
              // Enter Radix's roving focus group through its real predecessor.
              await evaluate(`document.getElementById(${JSON.stringify(id.replace(/-tab$/, "-button"))}).focus()`);
            } else {
              await evaluate(`(() => {
                const e = document.getElementById(${JSON.stringify(id)});
                const sentinel = document.createElement('button');
                sentinel.id = '__focus-sentinel'; sentinel.type = 'button';
                sentinel.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
                e.before(sentinel); sentinel.focus();
              })()`);
            }
            await key("Tab", "Tab", 9);
            await evaluate("document.getElementById('__focus-sentinel')?.remove()");
          } else {
            await click(`#${id}`);
            if (before.kind === "select") {
              await waitFor(() => evaluate("Boolean(document.querySelector('[role=listbox]'))"), "pointer opens focused Select");
              await settle();
              const menu = await evaluate("(() => { const e = document.querySelector('[role=listbox]'); const r = e.getBoundingClientRect(); return { x:r.x, right:r.right, scrollWidth:e.scrollWidth, clientWidth:e.clientWidth }; })()");
              assertInside(menu, width, `${width}px ${id} pointer menu`);
              check(menu.scrollWidth <= menu.clientWidth + 1, `${width}px ${id}: open Select menu does not clip labels`);
              if (context === "dialog" && width === 320) await screenshot(`${theme}-focus-${focusBaseline ? "before" : "after"}-${width}-select-open.png`);
              await click('[role=listbox] [role=option]');
              await waitFor(() => evaluate("!document.querySelector('[role=listbox]')"), "pointer selection closes focused Select");
            }
          }
          await settle();
          const focused = await measureFocus(id);
          const previousPaint = focusPaintOutsets(before.boxShadow, before.outlineWidth, before.outlineOffset, before.outlineStyle, before.outlineColor);
          const totalPaint = focusPaintOutsets(focused.boxShadow, focused.outlineWidth, focused.outlineOffset, focused.outlineStyle, focused.outlineColor);
          const focusOutsets = Object.fromEntries(Object.keys(totalPaint).map((side) => [side, Math.max(0, totalPaint[side] - previousPaint[side])]));
          const textual = ["input", "textarea", "select"].includes(focused.kind);
          const label = `${width}px ${forcedColors ? "forced-colors " : ""}${id} ${mode}`;
          check(focused.active, `${label}: control receives actual ${mode} focus (active=${focused.activeId})`);
          check(focused.documentWidth <= width + 1, `${label}: focused page stays within viewport`);
          assertInside(focused.rect, width, label);
          if (focusBaseline && textual) {
            check(Object.values(totalPaint).every((value) => value === 4), `${label}: baseline reproduces 2px ring + 2px offset`);
          } else if (focused.kind !== "raw-checkbox") {
            check(Object.values(focusOutsets).every((value) => value <= 0.1), `${label}: focus paints beyond control: ${JSON.stringify({ focusOutsets, boxShadow: focused.boxShadow, outline: focused.outlineStyle, outlineOffset: focused.outlineOffset })}`);
            if (textual || mode === "keyboard") {
              check(focused.boxShadow !== before.boxShadow || (focused.outlineStyle !== "none" && !/transparent|rgba\([^)]*,\s*0\)/.test(focused.outlineColor)), `${label}: focus has a visible indicator`);
            }
          }
          const paint = { x: focused.rect.x - focusOutsets.left, right: focused.rect.right + focusOutsets.right, y: focused.rect.y - focusOutsets.top, bottom: focused.rect.bottom + focusOutsets.bottom };
          if (!focusBaseline || !textual) {
            check(paint.x >= focused.boundary.x - 1 && paint.right <= focused.boundary.right + 1, `${label}: focus stays within its field/row margins`);
            for (const clip of focused.clips) {
              check(paint.x >= clip.x - 1 && paint.right <= clip.right + 1, `${label}: focus is not clipped horizontally by scrolling ancestor`);
            }
          }
          if (focused.kind === "textarea" && !focusBaseline) {
            check(focused.resize === "vertical", `${label}: textarea resizes only vertically`);
            check(focused.minWidth === "0px" && focused.maxWidth === "100%", `${label}: textarea width is bounded`);
          }
          if (["button", "select", "tab"].includes(focused.kind)) {
            check(focused.scrollWidth <= focused.clientWidth + 1 && focused.scrollHeight <= focused.clientHeight + 1, `${label}: long label remains inside focused control`);
          }
          measurements.push({ id, kind: focused.kind, mode, boxShadow: focused.boxShadow, outlineStyle: focused.outlineStyle, outlineWidth: focused.outlineWidth, outlineOffset: focused.outlineOffset, outlineColor: focused.outlineColor, ringOffset: focused.ringOffset, ringInset: focused.ringInset, focusOutsets });
          if (mode === "keyboard" && context === "dialog" && ["input", "textarea", "select"].includes(focused.kind)) {
            await screenshot(`${theme}-focus-${focusBaseline ? "before" : forcedColors ? "high-contrast" : "after"}-${width}-${focused.kind}.png`);
          }
        }
      }
    }
    await key("Escape", "Escape", 27);
    await waitFor(() => evaluate("!document.querySelector('[data-fixture=focus-dialog]')"), "focus dialog closes");
    await settle();
    const passed = failuresBeforeCase === failures.length;
    results.push({ theme, width, height, forcedColors, fixture: focusBaseline ? "focus-baseline-simulated" : "focus-containment", passed, measurements });
    console.log(`${passed ? "PASS" : "FAIL"} ${theme} ${width}px ${forcedColors ? "forced-colors " : ""}focus: ${measurements.length} keyboard/pointer checks, painted ring bounds, scroll/toolbar/dialog`);
  }
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "none" }] });
  if (screenshotDirectory && !accessOnly && !focusOnly) {
    for (const theme of ["light", "dark"]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
      const caseUrl = `${pageUrl}?fixture=navigation&labels=normal&theme=${theme}`;
      await cdp.send("Page.navigate", { url: caseUrl });
      await waitFor(() => evaluate(`Boolean(window.__responsiveReady) && location.href === ${JSON.stringify(caseUrl)}`), "normal-label navigation fixture");
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === "dark"})`);
      await settle();
      await screenshot(`${theme}-menu-normal-390-closed.png`);
      await click('[aria-label="Abrir menu"]');
      await waitFor(() => evaluate("Boolean(document.querySelector('[data-mobile-navigation-panel]'))"), "normal-label navigation opens");
      await settle();
      await screenshot(`${theme}-menu-normal-390-open.png`);
    }
  }
  let focusReportPath = null;
  if (screenshotDirectory && results.some((result) => result.measurements)) {
    await mkdir(screenshotDirectory, { recursive: true });
    focusReportPath = join(screenshotDirectory, `focus-${focusBaseline ? "baseline" : forcedColorsOnly ? "high-contrast" : "current"}-report.json`);
    await writeFile(focusReportPath, JSON.stringify(results.filter((result) => result.measurements), null, 2));
  }
  const summaryResults = results.map((result) => result.measurements ? {
    ...result,
    measurements: result.measurements.length,
    maximumSharedFocusOutset: Math.max(...result.measurements.filter((measurement) => measurement.kind !== "raw-checkbox").flatMap((measurement) => Object.values(measurement.focusOutsets))),
    nativeCheckboxMaximumOutset: Math.max(...result.measurements.filter((measurement) => measurement.kind === "raw-checkbox").flatMap((measurement) => Object.values(measurement.focusOutsets))),
  } : result);
  console.log(JSON.stringify({ passed: !failures.length, scope: "real shared component fixtures; not authenticated route coverage", screenshotDirectory, focusReportPath, results: summaryResults, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([new Promise((resolveExit) => chrome.once("exit", resolveExit)), delay(2000)]);
  }
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  // Only remove the concrete mkdtemp directory created by this process.
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  assert.ok(resolvedTemporaryRoot.startsWith(resolve(tmpdir()) + sep));
  assert.ok(resolvedTemporaryRoot.includes("ipxdata-responsive-"));
  await rm(resolvedTemporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
async function checkScenarioNames(width, selector, expectedCount) {
  const labels = await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)}), e => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight }; })`);
  check(labels.length === expectedCount, `${width}px: scenario labels remain available`);
  for (const label of labels) {
    assertInside(label, width, `${width}px scenario label`);
    check(label.scrollWidth <= label.clientWidth + 1, `${width}px: scenario name clips horizontally`);
    check(label.scrollHeight <= label.clientHeight + 1, `${width}px: scenario name clips vertically`);
  }
}
async function waitFor(predicate, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function settle() { await delay(250); }
async function measureFocus(id) {
  return evaluate(`(() => {
    const e = document.getElementById(${JSON.stringify(id)});
    const paint = e.dataset.focusControl === 'checkbox' ? (e.parentElement.querySelector('[data-checkbox-indicator]') || e.parentElement.querySelector('span[aria-hidden]') || e) : e;
    const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x, right:r.right, y:r.y, bottom:r.bottom }; };
    const style = getComputedStyle(paint);
    const clips = [];
    for (let parent = e.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowX)) {
        const r = parent.getBoundingClientRect();
        clips.push({ x:r.x + parent.clientLeft, right:r.x + parent.clientLeft + parent.clientWidth });
      }
    }
    return { kind:e.dataset.focusControl, active:document.activeElement === e, activeId:document.activeElement?.id, rect:rect(paint), boundary:rect(e.closest('[data-focus-boundary]')), clips,
      boxShadow:style.boxShadow, outlineStyle:style.outlineStyle, outlineWidth:style.outlineWidth, outlineOffset:style.outlineOffset, outlineColor:style.outlineColor,
      ringOffset:style.getPropertyValue('--tw-ring-offset-width'), ringInset:style.getPropertyValue('--tw-ring-inset'),
      resize:style.resize, minWidth:style.minWidth, maxWidth:style.maxWidth, documentWidth:document.documentElement.scrollWidth,
      scrollWidth:e.scrollWidth, clientWidth:e.clientWidth, scrollHeight:e.scrollHeight, clientHeight:e.clientHeight };
  })()`);
}

// getBoundingClientRect excludes shadows and outlines. Account for their
// potential outward painting, while inset rings remain inside the border box.
function focusPaintOutsets(boxShadow, outlineWidth = "0px", outlineOffset = "0px", outlineStyle = "none", outlineColor = "black") {
  const outsets = { top: 0, right: 0, bottom: 0, left: 0 };
  const shadows = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < boxShadow.length; index += 1) {
    const character = boxShadow[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      shadows.push(boxShadow.slice(start, index));
      start = index + 1;
    }
  }
  shadows.push(boxShadow.slice(start));
  for (const shadow of shadows) {
    if (/\binset\b|\btransparent\b/.test(shadow) || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(shadow)) continue;
    const lengths = [...shadow.matchAll(/(-?(?:\d*\.)?\d+)px/g)].map((match) => Number(match[1]));
    if (lengths.length < 2) continue;
    const [x, y, blur = 0, spread = 0] = lengths;
    const extent = spread + blur;
    outsets.top = Math.max(outsets.top, extent - y);
    outsets.right = Math.max(outsets.right, extent + x);
    outsets.bottom = Math.max(outsets.bottom, extent + y);
    outsets.left = Math.max(outsets.left, extent - x);
  }
  if (outlineStyle !== "none" && outlineStyle !== "hidden" && !/transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(outlineColor)) {
    const extent = Math.max(0, parseFloat(outlineWidth) + parseFloat(outlineOffset));
    for (const side of Object.keys(outsets)) outsets[side] = Math.max(outsets[side], extent);
  }
  return outsets;
}
async function readAccessCheckboxes() {
  await settle();
  return evaluate(`Object.fromEntries([...document.querySelectorAll('[data-user-access-group]')].map(section => {
    const inputs = [...section.querySelectorAll('input[type=checkbox]')].map(e => ({ checked: e.checked, disabled: e.disabled, mixed: e.indeterminate, label: e.getAttribute('aria-label') }));
    return [section.querySelector('h3').textContent, { group: inputs[0], options: inputs.slice(1) }];
  }))`);
}
async function checkNavigationGeometry(width, height, label) {
  const panel = await evaluate(`(() => { const e = document.querySelector('[data-mobile-navigation-panel]'); const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, links: e.querySelectorAll('[data-fixture-menu-link]').length, namedNav: Boolean(e.querySelector('nav[aria-label="Navegação principal em telas pequenas"]')) }; })()`);
  assertInside(panel, width, label);
  check(panel.y >= -1 && panel.bottom <= height + 1, `${label}: drawer fits viewport height`);
  check(panel.scrollWidth <= panel.clientWidth + 1, `${label}: drawer has no horizontal content overflow`);
  check(panel.links === 11 && panel.namedNav, `${label}: all destinations are present in named navigation`);
  for (let index = 0; index < panel.links; index += 1) {
    const link = await evaluate(`(() => { const e = document.querySelectorAll('[data-fixture-menu-link]')[${index}]; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); const text = e.querySelector('[data-fixture-menu-label]'); const p = document.elementFromPoint(r.x + r.width / 2, Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2))); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, textWidth: text.scrollWidth, textClientWidth: text.clientWidth, textHeight: text.scrollHeight, textClientHeight: text.clientHeight, reachable: Boolean(p && e.contains(p)) }; })()`);
    assertInside(link, width, `${label} destination ${index}`);
    check(link.reachable, `${label}: destination ${index} reachable by scrolling`);
    check(link.textWidth <= link.textClientWidth + 1 && link.textHeight <= link.textClientHeight + 1, `${label}: destination ${index} label is not clipped`);
  }
  for (const action of ["Alternar tema", "Sair"]) {
    const button = await evaluate(`(() => { const e = document.querySelector('[data-mobile-navigation-panel] [aria-label="${action}"]'); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: r.x, right: r.right, reachable: Boolean(hit && e.contains(hit)) }; })()`);
    check(Boolean(button?.reachable), `${label}: account action ${action} is reachable`);
    if (button) assertInside(button, width, `${label} ${action}`);
  }
}
async function waitForNavigationClosed(label) {
  await waitFor(() => evaluate("!document.querySelector('[data-mobile-navigation-panel]') && !document.querySelector('[data-mobile-navigation-overlay]')"), `${label} closes`);
  await settle();
  const unlocked = await evaluate("document.body.style.pointerEvents !== 'none' && !document.body.hasAttribute('data-scroll-locked') && getComputedStyle(document.body).overflow !== 'hidden'");
  check(unlocked, `${label}: closing releases page scroll/pointer lock`);
}
async function assertPageInteractive(label) {
  const before = await evaluate("window.__outsideClicks || 0");
  await click("#outside-menu-action");
  check(await evaluate("window.__outsideClicks || 0") === before + 1, `${label}: page actions remain clickable`);
}
async function screenshot(filename, fullPage = false) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  const dimensions = fullPage
    ? await evaluate("({ width: innerWidth, height: document.documentElement.scrollHeight })")
    : null;
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: fullPage,
    ...(dimensions ? { clip: { x: 0, y: 0, ...dimensions, scale: 1 } } : {}),
  });
  await writeFile(join(screenshotDirectory, filename), Buffer.from(result.data, "base64"));
}
async function click(selector) {
  const point = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await clickPoint(point);
}
async function clickPoint(point) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}
async function key(value, code, virtualKeyCode, modifiers = 0) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: value, code, modifiers, windowsVirtualKeyCode: virtualKeyCode });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: value, code, modifiers, windowsVirtualKeyCode: virtualKeyCode });
}
function assertInside(rect, width, label) {
  check(rect.x >= -1 && rect.right <= width + 1, `${label} outside viewport: ${JSON.stringify(rect)}`);
}
function check(condition, message) {
  if (condition) return;
  failures.push(`${currentTheme}: ${message}`);
  console.error(`${currentTheme}: ${message}`);
}
async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  return {
    close: () => socket.close(),
    send: (method, params = {}) => new Promise((resolveCommand, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 20000);
      pending.set(id, { resolve: resolveCommand, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    }),
  };
}
