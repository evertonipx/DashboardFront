/** Real SVG component, actual global CSS, isolated Chrome and no application/auth.
 * Run: node tools/verify-brand-mark.mjs [--screenshots]
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

function loadComponent() {
  const ts = require("typescript");
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const loaded = { exports: {} };
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function("module", "exports", "require", source)(loaded, loaded.exports, (name) => {
      if (!name.startsWith("@/")) return require(name);
      const target = join(root, name.slice(2));
      return load([`${target}.tsx`, `${target}.ts`].find(existsSync));
    });
    modules.set(path, loaded.exports);
    return loaded.exports;
  }
  return load(join(root, "components/app/brand-mark.tsx")).IPXBrandMark;
}

function fixtureMarkup() {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Mark = loadComponent();
  let markIndex = 0;
  const mark = (className, decorative = true) => renderToStaticMarkup(React.createElement(Mark, { className, decorative }), {
    identifierPrefix: `brand-fixture-${markIndex++}-`,
  });
  return `<main class="min-h-screen bg-background p-6 text-foreground">
    <h1 class="text-base font-semibold">Marca IPXData · componente real</h1>
    <p class="mt-1 text-xs text-muted-foreground">Tamanhos nativos, sem sessão autenticada ou dados de produção.</p>
    <div class="mt-6 grid grid-cols-2 gap-6">
      <section><h2 class="mb-2 text-xs text-muted-foreground">Menu expandido · 40 px</h2>
        <div data-brand-context="expanded" data-size="40" class="flex h-16 w-64 items-center justify-start gap-3 border border-border bg-card px-4 text-card-foreground">
          ${mark("h-10 w-10")}<div class="min-w-0"><div class="text-base font-semibold tracking-normal">IPXData</div><div class="text-xs text-muted-foreground">Inteligência de dados</div></div>
        </div>
      </section>
      <section><h2 class="mb-2 text-xs text-muted-foreground">Menu recolhido · 40 px</h2>
        <div data-brand-context="collapsed" data-size="40" class="flex h-16 w-20 items-center justify-center gap-3 border border-border bg-card px-2 text-card-foreground">${mark("h-10 w-10", false)}</div>
      </section>
      <section><h2 class="mb-2 text-xs text-muted-foreground">Cabeçalho móvel · 36 px</h2>
        <div data-brand-context="mobile" data-size="36" class="flex w-80 items-center justify-between gap-3 border border-border bg-card px-4 py-2">
          <div class="flex min-w-0 items-center gap-2.5">${mark("h-9 w-9")}<div class="min-w-0"><div class="text-sm font-semibold">IPXData</div><div class="text-xs leading-4 text-muted-foreground">Ao Vivo</div></div></div>
          <button class="flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm"><span aria-hidden="true">☰</span>Menu</button>
        </div>
      </section>
      <section><h2 class="mb-2 text-xs text-muted-foreground">Menu móvel aberto · 40 px</h2>
        <div data-brand-context="drawer" data-size="40" class="flex w-80 items-center justify-between gap-3 border border-border bg-card py-3 pl-4 pr-3">
          <div class="flex min-w-0 items-center gap-3">${mark("h-10 w-10")}<div class="min-w-0"><div class="text-base font-semibold">IPXData</div><div class="text-xs font-medium text-muted-foreground">Menu principal</div></div></div>
          <button aria-label="Fechar menu" class="h-11 w-11">×</button>
        </div>
      </section>
    </div>
    <svg data-brand-sentinel width="16" height="16" class="mt-8" aria-hidden="true"><path class="ipx-mark-type" stroke="rgb(160,40,40)" stroke-width="2" fill="none" d="M2 2L14 14" /></svg>
  </main>`;
}

async function main() {
  const chromePath = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
  assert.ok(chromePath, "Chrome is required (or set CHROME_PATH).");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ipxdata-brand-mark-"));
  const screenshots = process.argv.includes("--screenshots") ? join(root, "artifacts", "responsive-current") : null;
  const failures = [];
  const results = [];
  const requests = [];
  let chrome;
  let server;
  let cdp;
  try {
    const markup = fixtureMarkup();
    assert.equal((markup.match(/data-ipx-brand-mark=/g) || []).length, 4);
    const config = require("tailwindcss/loadConfig")(join(root, "tailwind.config.ts"));
    // The theme class is added by the fixture server, outside the SSR subtree.
    // Include it here so Tailwind retains the project's real `.dark` base rules.
    config.content = [{ raw: `<html class="dark">${markup}</html>`, extension: "html" }];
    const css = await require("postcss")([require("tailwindcss")(config)]).process(await readFile(join(root, "app/globals.css"), "utf8"), { from: join(root, "app/globals.css") });
    server = createServer((request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css.css); return; }
      if (url.pathname !== "/") { response.writeHead(404).end(); return; }
      const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html class="${theme}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body>${markup}</body></html>`);
    });
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const profile = join(temporaryRoot, "chrome-profile");
    chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
    await waitFor(() => existsSync(join(profile, "DevToolsActivePort")), "isolated Chrome");
    const debugPort = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0];
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    cdp = await connectCdp(pages.find((page) => page.type === "page").webSocketDebuggerUrl, (event) => {
      if (event.method === "Network.requestWillBeSent") requests.push(event.params.request.url);
    });
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 850, height: 430, deviceScaleFactor: 1, mobile: false });
    const evaluate = async (expression) => {
      const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (const theme of ["light", "dark"]) {
      for (const mode of ["normal", "reduced-motion", "forced-colors"]) {
        const label = `${theme}-${mode}`;
        const check = (condition, message) => { if (!condition) failures.push(`${label}: ${message}`); };
        await cdp.send("Emulation.setEmulatedMedia", { features: [
          { name: "prefers-reduced-motion", value: mode === "reduced-motion" ? "reduce" : "no-preference" },
          { name: "forced-colors", value: mode === "forced-colors" ? "active" : "none" },
        ] });
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
        await cdp.send("Page.navigate", { url: `${origin}/?theme=${theme}&mode=${mode}` });
        await waitFor(() => evaluate(`location.search === '?theme=${theme}&mode=${mode}' && document.readyState === 'complete' && document.querySelectorAll('[data-ipx-brand-mark]').length === 4`), label);
        const initial = await evaluate(`(${measureBrandMarks.toString()})()`);
        const animationSamples = await evaluate(`new Promise(resolve => {
          const start=performance.now(), samples=[];
          function sample(){samples.push((${measureBrandMarks.toString()})());if(performance.now()-start >= ${mode === "normal" ? 4200 : 200})resolve(samples);else requestAnimationFrame(sample)}sample();
        })`);
        const settled = animationSamples.at(-1);
        check(settled.pageWidth <= 850, "fixture overflows horizontally");
        check(settled.theme === theme && (mode === "forced-colors" || settled.colorScheme === theme), "the real CSS theme is not applied");
        check(settled.sentinelStroke === "rgb(160, 40, 40)", "mark CSS leaks to unrelated SVG");
        check(new Set(settled.ids).size === settled.ids.length, "SVG instances have duplicate local IDs");
        for (const mark of settled.marks) {
          const before = initial.marks.find((item) => item.context === mark.context);
          const frames = animationSamples.map((sample) => sample.marks.find((item) => item.context === mark.context));
          check(mark.width === mark.expectedSize && mark.height === mark.expectedSize, `${mark.context}: expected ${mark.expectedSize}px`);
          check(mark.ids.length === 2 && mark.references.length === 2 && mark.references.every((reference) => reference.local), `${mark.context}: paint/clip references must resolve inside their own SVG`);
          check(mark.focusable === "false", `${mark.context}: decorative graphic must not create a tab stop`);
          check(mark.context === "collapsed" ? mark.role === "img" && mark.ariaLabel === "IPXData" && mark.ariaHidden !== "true" : mark.ariaHidden === "true" && !mark.ariaLabel, `${mark.context}: accessible name/decorative state differs from its context`);
          check(mark.paths.every((path) => path.x >= mark.x && path.y >= mark.y && path.right <= mark.right && path.bottom <= mark.bottom), `${mark.context}: paths overflow the reserved box`);
          check(frames.every((item) => ["x", "y", "width", "height"].every((key) => item[key] === before[key])), `${mark.context}: entry animation shifts layout`);
          check(frames.every((item) => JSON.stringify(item.glyphs) === JSON.stringify(before.glyphs)), `${mark.context}: base letters change while the light passes`);
          check(mark.glyphs.length === 2 && mark.glyphs.every((glyph) => glyph.opacity === "1"), `${mark.context}: the opaque base letters must remain present`);
          check(mark.clipMatchesGlyphs && mark.scanAriaHidden === "true" && mark.scanPointerEvents === "none", `${mark.context}: light must be clipped to the letters and ignore accessibility/pointer input`);
          check(mark.animations.every((animation) => animation.playState !== "running"), `${mark.context}: animation keeps running after settling`);
          if (mode === "normal") {
            check(before.animations.length > 0, `${mark.context}: entry animation did not start`);
            check(before.animations.every((animation) => animation.iterations === 1 && animation.endTime <= 4000), `${mark.context}: entry animation is not finite within four seconds`);
            check(frames.some((item) => Number(item.sweepOpacity) > 0 && item.sweepX < item.glyphMaxX && item.sweepX + item.sweepWidth > item.glyphMinX), `${mark.context}: moving light never crosses the visible letters`);
            check(before.sweepX + before.sweepWidth <= before.glyphMinX && mark.sweepX >= mark.glyphMaxX, `${mark.context}: sweep must travel across the complete monogram`);
            check(frames.every((item, index) => index === 0 || item.sweepX >= frames[index - 1].sweepX - 0.001), `${mark.context}: sweep reverses instead of moving left to right`);
          } else {
            check(before.animations.every((animation) => animation.playState !== "running"), `${mark.context}: motion is active in ${mode}`);
            check(mark.scanDisplay === "none", `${mark.context}: scan is visible in ${mode}`);
          }
          check(mark.sweepOpacity === "0" || mark.scanDisplay === "none", `${mark.context}: light does not settle invisibly`);
          if (mode === "forced-colors") check(mark.monogramFills.every((fill) => fill === mark.foreground) && mark.surfaceFill !== mark.foreground, `${mark.context}: forced-colors monogram loses contrast`);
        }
        let midpoint = null;
        if (screenshots) {
          await mkdir(screenshots, { recursive: true });
          const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          await writeFile(join(screenshots, `brand-mark-${label}.png`), Buffer.from(screenshot.data, "base64"));
          if (mode === "normal") {
            // Inspect a deterministic frame of the real CSS effect after the
            // unmodified animation has passed the duration/movement checks.
            await evaluate("document.querySelectorAll('[data-ipx-brand-mark]').forEach(mark=>mark.getAnimations({subtree:true}).forEach(animation=>{animation.pause();animation.currentTime=1800})); true");
            await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
            midpoint = await evaluate(`(${measureBrandMarks.toString()})()`);
            const middleScreenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
            await writeFile(join(screenshots, `brand-mark-${theme}-midpoint.png`), Buffer.from(middleScreenshot.data, "base64"));
            await evaluate("document.querySelectorAll('[data-ipx-brand-mark]').forEach(mark=>mark.getAnimations({subtree:true}).forEach(animation=>animation.finish())); true");
          }
        }
        const target = settled.marks[0];
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: target.x + target.width / 2, y: target.y + target.height / 2 });
        await delay(100);
        const hovered = await evaluate(`(${measureBrandMarks.toString()})()`);
        check(hovered.marks.every((item, index) => ["x", "y", "width", "height"].every((key) => item[key] === settled.marks[index][key])), "hover shifts the reserved logo geometry");
        check(hovered.marks.every((item, index) => item.sweepOpacity === settled.marks[index].sweepOpacity && item.animations.every((animation) => animation.playState !== "running")), "hover unexpectedly restarts or reveals the light effect");
        const unexpected = requests.filter((url) => !url.startsWith(`${origin}/?`) && url !== `${origin}/fixture.css`);
        check(unexpected.length === 0, `SVG causes unexpected requests: ${unexpected.join(", ")}`);
        results.push({ label, initial, settled, hovered, midpoint, geometryFrames: animationSamples.length });
        console.log(`${failures.some((failure) => failure.startsWith(label + ":")) ? "FAIL" : "PASS"} ${label}: four real marks / stable geometry / accessibility / no asset requests`);
      }
    }
    const light = results.find((result) => result.label === "light-normal");
    const dark = results.find((result) => result.label === "dark-normal");
    if (light.settled.marks[0].foreground === dark.settled.marks[0].foreground) failures.push("light/dark: real theme foregrounds must differ");
    if (screenshots) await writeFile(join(screenshots, "brand-mark-report.json"), JSON.stringify({ scope: "real SSR SVG and global CSS; isolated synthetic navigation contexts; no authenticated routes", results, requests, failures }, null, 2));
    console.log(JSON.stringify({ cases: results.length, failures, screenshots }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    cdp?.close();
    if (chrome && chrome.exitCode === null) { chrome.kill(); await Promise.race([new Promise((resolveExit) => chrome.once("exit", resolveExit)), delay(2000)]); }
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    const target = resolve(temporaryRoot);
    assert.ok(dirname(target) === resolve(tmpdir()) && basename(target).startsWith("ipxdata-brand-mark-"));
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

export function measureBrandMarks() {
  const bounds = (element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom }; };
  return {
    pageWidth: document.documentElement.scrollWidth,
    theme: document.documentElement.dataset.theme,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    sentinelStroke: getComputedStyle(document.querySelector("[data-brand-sentinel] path")).stroke,
    ids: [...document.querySelectorAll("[data-ipx-brand-mark] [id]")].map((element) => element.id),
    marks: [...document.querySelectorAll("[data-ipx-brand-mark]")].map((mark) => {
      const context = mark.closest("[data-brand-context]");
      const scan = mark.querySelector(".ipx-mark-scan");
      const sweep = mark.querySelector(".ipx-mark-sweep");
      const scanStyle = getComputedStyle(scan);
      const sweepStyle = getComputedStyle(sweep);
      const glyphs = [...mark.querySelectorAll(".ipx-mark-type")];
      const glyphDefinitions = glyphs.map((path) => ({ d: path.getAttribute("d"), rule: path.getAttribute("fill-rule") || "nonzero" }));
      const references = [...mark.querySelectorAll("*")].flatMap((element) => [...element.attributes].flatMap((attribute) => {
        const values = attribute.name === "href" || attribute.name === "xlink:href"
          ? [attribute.value] : [...attribute.value.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)].map((match) => match[1]);
        return values.map((value) => {
          const target = value.startsWith("#") ? document.getElementById(value.slice(1)) : null;
          return { value, target: target?.tagName || null, local: Boolean(target && mark.contains(target)) };
        });
      }));
      const clipReference = references.find((reference) => reference.target === "clipPath");
      const clip = clipReference ? document.getElementById(clipReference.value.slice(1)) : null;
      const clipDefinitions = [...(clip?.querySelectorAll("path") || [])].map((path) => ({ d: path.getAttribute("d"), rule: path.getAttribute("clip-rule") || "nonzero" }));
      return {
        context: context.dataset.brandContext, expectedSize: Number(context.dataset.size), ...bounds(mark),
        ids: [...mark.querySelectorAll("[id]")].map((element) => element.id), references,
        role: mark.getAttribute("role"), ariaLabel: mark.getAttribute("aria-label"), ariaHidden: mark.getAttribute("aria-hidden"), focusable: mark.getAttribute("focusable"),
        paths: [...mark.querySelectorAll("path")].filter((path) => !path.closest("defs") && getComputedStyle(path).display !== "none").map(bounds),
        glyphs: glyphs.map((path) => ({ ...bounds(path), fill: getComputedStyle(path).fill, opacity: getComputedStyle(path).opacity })),
        glyphMinX: Math.min(...glyphs.map((path) => path.getBBox().x)),
        glyphMaxX: Math.max(...glyphs.map((path) => { const box = path.getBBox(); return box.x + box.width; })),
        clipMatchesGlyphs: clip?.getAttribute("clipPathUnits") === "userSpaceOnUse" && JSON.stringify(clipDefinitions) === JSON.stringify(glyphDefinitions),
        animations: mark.getAnimations({ subtree: true }).map((animation) => ({ playState: animation.playState, ...animation.effect.getComputedTiming() })),
        sweepOpacity: sweepStyle.opacity, sweepX: new DOMMatrix(sweepStyle.transform === "none" ? undefined : sweepStyle.transform).m41,
        sweepWidth: Number(sweep.getAttribute("width")),
        scanDisplay: scanStyle.display, scanPointerEvents: scanStyle.pointerEvents, scanAriaHidden: scan.getAttribute("aria-hidden"),
        foreground: getComputedStyle(mark).color,
        surfaceFill: getComputedStyle(mark.querySelector(".ipx-mark-surface")).fill,
        monogramFills: [...mark.querySelectorAll(".ipx-mark-type")].map((path) => getComputedStyle(path).fill),
      };
    }),
  };
}

function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
async function waitFor(predicate, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(50); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function connectCdp(url, onEvent) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) { onEvent?.(message); return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
  });
  return {
    close: () => socket.close(),
    send: (method, params = {}) => new Promise((resolveCommand, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve: resolveCommand, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
