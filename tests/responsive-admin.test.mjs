import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (pathname) =>
  readFileSync(resolve(projectRoot, pathname), "utf8");

test("menu mobile usa painel acessível com rótulos completos, sem faixa horizontal", () => {
  const shell = readSource("components/app/app-shell.tsx");
  const menu = readSource("components/app/mobile-navigation.tsx");
  const mobileNav = shell.slice(shell.indexOf("<MobileNavigation"), shell.indexOf("</MobileNavigation>"));

  assert.match(menu, /DialogPrimitive\.Root open=\{open\} onOpenChange=\{setOpen\}/);
  assert.match(menu, /DialogPrimitive\.Title/);
  assert.match(menu, /DialogPrimitive\.Description/);
  assert.match(menu, /aria-label="Abrir menu"/);
  assert.match(menu, /aria-label="Fechar menu"/);
  assert.match(menu, /overflow-y-auto overscroll-contain/);
  assert.match(menu, /h-\[100dvh\]/);
  assert.match(menu, /safe-area-inset-bottom/);
  assert.match(mobileNav, /navItems\.map/);
  assert.match(mobileNav, /min-h-11/);
  assert.match(mobileNav, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(mobileNav, /overflow-x-auto|whitespace-nowrap|truncate/);
  assert.match(mobileNav, /\{item\.label\}/);
  assert.match(shell, /w-80 max-w-full animate-pulse/);
});

test("menu mobile fecha ao navegar ou mudar para desktop, mantendo o escopo autorizado", () => {
  const menu = readSource("components/app/mobile-navigation.tsx");
  const shell = readSource("components/app/app-shell.tsx");
  const mobileNav = shell.slice(shell.indexOf("<MobileNavigation"), shell.indexOf("</MobileNavigation>"));

  assert.match(menu, /closeMenu\(\);\s*\}, \[pathname, closeMenu\]\)/);
  assert.match(menu, /matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(menu, /desktop\.addEventListener\("change", closeOnDesktop\)/);
  assert.match(menu, /desktop\.removeEventListener\("change", closeOnDesktop\)/);
  assert.match(menu, /onCloseAutoFocus/);
  assert.match(menu, /getElementById\("main-content"\)\?\.focus/);
  assert.match(mobileNav, /onClick=\{\(\) => \{\s*if \(liveItem\) requestLiveRefresh\(\);\s*closeMenu\(\)/);
  assert.match(mobileNav, /prefetch=\{false\}/);
  assert.match(shell, /managerNavItems\.filter\(\(item\) => !item\.canShow \|\| item\.canShow\(user\)\)/);
  assert.doesNotMatch(menu, /apiFetch|localStorage|fetch\(/);
});

test("tabelas e abas contêm sua rolagem sem expandir os ancestrais", () => {
  const table = readSource("components/ui/table.tsx");
  const tabs = readSource("components/ui/tabs.tsx");

  assert.match(table, /relative min-w-0 w-full max-w-full overflow-auto/);
  assert.match(table, /role=\{scrollRegionLabel \? "region" : undefined\}/);
  assert.match(table, /tabIndex=\{scrollRegionLabel \? 0 : undefined\}/);
  assert.match(tabs, /inline-flex h-10 min-w-0 max-w-full/);
  assert.match(tabs, /mt-2 min-w-0 max-w-full ring-offset-background/);
});

test("modais administrativos mantêm limite dinâmico e uma coluna que pode encolher", () => {
  const dialog = readSource("components/ui/dialog.tsx");

  assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(dialog, /w-\[calc\(100%-2rem\)\]/);
  assert.match(dialog, /grid-cols-\[minmax\(0,1fr\)\]/);
  assert.match(dialog, /overflow-y-auto/);

  for (const filename of [
    "scenario-manager.tsx",
    "occupancy-scenario-manager.tsx",
    "super-admin-dashboard.tsx",
  ]) {
    const source = readSource(`components/app/${filename}`);
    assert.doesNotMatch(source, /max-h-\[92vh\]/, filename);
  }
});

test("filtros e linhas de cenário usam trilhas de largura mínima zero", () => {
  for (const filename of [
    "scenario-manager.tsx",
    "occupancy-scenario-manager.tsx",
  ]) {
    const source = readSource(`components/app/${filename}`);
    assert.match(source, /md:grid-cols-\[minmax\(0,1fr\)_180px_auto\]/);
    assert.doesNotMatch(source, /minmax\(220px,1fr\)/, filename);
  }

  const scenarios = readSource("components/app/scenario-manager.tsx");
  assert.match(
    scenarios,
    /md:grid-cols-\[minmax\(0,1fr\)_150px_minmax\(0,1fr\)_44px\]/,
  );
  assert.match(scenarios, /\[&>div\]:min-w-0/);
});

test("construtor de visões organiza campos pela largura do próprio card", () => {
  const views = readSource("components/app/views-manager.tsx");

  assert.match(views, /<Card className="@container">/);
  assert.match(views, /@lg:grid-cols-2/);
  assert.match(views, /@lg:col-span-2/);
  assert.match(views, /@2xl:grid-cols-3/);
  assert.match(views, /@2xl:col-span-3/);
  assert.doesNotMatch(views, /md:(?:grid-cols|col-span)-/);
});

test("campos administrativos encolhem e cabeçalhos de permissão empilham no mobile", () => {
  for (const filename of [
    "infrastructure-manager.tsx",
    "occupancy-scenario-manager.tsx",
    "super-admin-dashboard.tsx",
    "views-manager.tsx",
    "worker-manager.tsx",
  ]) {
    const source = readSource(`components/app/${filename}`);
    const formField = source.slice(source.indexOf("function FormField("));
    assert.match(formField, /<div className="min-w-0 space-y-2">/, filename);
  }

  const master = readSource("components/app/super-admin-dashboard.tsx");
  const accessGrid = readSource("components/app/user-access-grid.tsx");
  assert.match(master, /<UserAccessGrid/);
  assert.match(
    accessGrid,
    /flex min-w-0 flex-wrap items-center justify-between[\s\S]*?\{group\.label\}/,
  );
  assert.match(master, /scrollRegionLabel="Workers da empresa selecionada"/);
});
