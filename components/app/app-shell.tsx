"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  Camera,
  ChevronRight,
  FileText,
  Filter,
  Eye,
  LogOut,
  MapPinned,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/app/auth-provider";
import { ThemeToggle } from "@/components/app/theme-provider";
import { usePremiumShellMotion } from "@/components/app/use-premium-motion";
import { hasMasterAccess } from "@/lib/access";
import { requestLiveRefresh } from "@/lib/live-refresh";
import {
  getStoredMasterCompanyScope,
  MASTER_COMPANY_SCOPE_EVENT,
  type MasterCompanyScope,
} from "@/lib/master-company-scope";
import {
  canManageCameras,
  canManageLocations,
  canManageScenarios,
  canManageWorkers,
} from "@/lib/permissions";
import { cn, initials } from "@/lib/utils";
import type { CurrentUser } from "@/lib/types";

type AppShellProps = {
  mode: "manager" | "client";
  children: React.ReactNode;
  title?: string;
  description?: string;
};

const clientNavItems = [
  { href: "/dashboard/live", label: "Ao Vivo", icon: Activity },
  { href: "/dashboard/reports", label: "Relatórios", icon: FileText },
];

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  canShow?: (user: CurrentUser | null) => boolean;
};

const managerNavItems: NavItem[] = [
  { href: "/manager/live", label: "Ao Vivo", icon: Activity },
  { href: "/manager/reports", label: "Relatórios", icon: FileText },
  { href: "/manager/views", label: "Visões", icon: Eye },
  {
    href: "/manager/workers",
    label: "Workers",
    icon: ServerCog,
    canShow: canManageWorkers,
  },
  {
    href: "/manager/cameras",
    label: "Câmeras",
    icon: Camera,
    canShow: canManageCameras,
  },
  {
    href: "/manager/locations",
    label: "Locations",
    icon: MapPinned,
    canShow: canManageLocations,
  },
  {
    href: "/manager/scenarios",
    label: "Cenários",
    icon: Filter,
    canShow: canManageScenarios,
  },
];

const masterNavItem = { href: "/manager/master", label: "Master", icon: ShieldCheck };

export function AppShell({
  mode,
  children,
  title,
  description,
}: AppShellProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const shellRef = React.useRef<HTMLDivElement>(null);
  const isMaster = hasMasterAccess(user);
  const [masterCompanyScope, setMasterCompanyScope] =
    React.useState<MasterCompanyScope | null>(null);
  const [masterScopeReady, setMasterScopeReady] = React.useState(false);
  const companyName = getCompanyDisplayName(user, masterCompanyScope, mode);
  const navItems =
    mode === "manager"
      ? [
          ...(isMaster ? [masterNavItem] : []),
          ...managerNavItems.filter((item) => !item.canShow || item.canShow(user)),
        ]
      : isMaster
        ? [masterNavItem, ...clientNavItems]
        : clientNavItems;
  const pageTitle = title ?? (mode === "manager" ? "Manager" : "Dashboard do cliente");
  const pageDescription =
    description ??
    (mode === "manager"
      ? "Monitoramento ao vivo, relatórios e cadastros operacionais."
      : "Acesso somente leitura aos dados ao vivo e aos resultados por cenário.");

  usePremiumShellMotion(shellRef);

  React.useEffect(() => {
    function syncScope() {
      const storedScope = getStoredMasterCompanyScope();
      if (storedScope) {
        setMasterCompanyScope(storedScope);
        setMasterScopeReady(true);
        return;
      }

      setMasterCompanyScope(null);
      setMasterScopeReady(true);
    }

    syncScope();
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncScope);
    window.addEventListener("storage", syncScope);

    return () => {
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncScope);
      window.removeEventListener("storage", syncScope);
    };
  }, [isMaster, user]);

  const requiresMasterCompanyScope =
    isMaster && !(mode === "manager" && pathname === "/manager/master");
  const content =
    requiresMasterCompanyScope && !masterScopeReady ? (
      <MasterScopeLoading />
    ) : requiresMasterCompanyScope && !masterCompanyScope ? (
      <MasterScopeRequired />
    ) : (
      children
    );
  const contentKey = isMaster
    ? masterCompanyScope?.id ?? "master-no-company-scope"
    : "tenant-user";

  return (
    <div ref={shellRef} className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card text-card-foreground lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground shadow-sm">
            IPX
          </div>
          <div>
            <div className="text-base font-semibold tracking-normal">IPXData</div>
            <div className="text-xs text-muted-foreground">Analytics Platform</div>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {isMaster ? "Escopo" : "Empresa"}
          </div>
          <div className="mt-1 truncate text-sm font-medium text-foreground">
            {companyName}
          </div>
        </div>

        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            const liveItem = item.href.endsWith("/live");

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (liveItem) requestLiveRefresh();
                }}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground",
                  active && "bg-primary/10 font-medium text-primary",
                )}
                data-premium-hover
                data-premium-nav-item
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-4 pb-5">
          <Separator className="mb-4 bg-border" />
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
              {initials(user?.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
          <ThemeToggle
            showLabel
            className="mt-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
              IPX
            </div>
            <div>
              <div className="text-sm font-semibold">IPXData</div>
              <div className="text-xs text-muted-foreground">{pageTitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            const liveItem = item.href.endsWith("/live");

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (liveItem) requestLiveRefresh();
                }}
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-md border bg-card px-3 py-2 text-xs font-medium",
                  active && "border-primary/30 bg-primary/10 text-primary",
                )}
                data-premium-hover
                data-premium-nav-item
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="w-full p-4">
          <div className="mb-4 max-w-4xl">
            <h1
              className="text-2xl font-semibold tracking-normal text-balance text-foreground"
              data-premium-title
            >
              {pageTitle}
            </h1>
            <p
              className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground"
              data-premium-description
            >
              {pageDescription}
            </p>
          </div>
          <div key={contentKey} data-premium-content>
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}

function MasterScopeLoading() {
  return (
    <div className="rounded-md border border-border bg-card p-6 shadow-soft">
      <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

function MasterScopeRequired() {
  return (
    <div className="rounded-md border border-dashed bg-card p-6 shadow-soft">
      <div className="flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">
            Selecione uma empresa
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Cenários, locations, câmeras, workers, ocupação e relatórios são
            dados de uma empresa. Escolha a empresa no Master antes de acessar
            essas telas.
          </p>
          <Button asChild className="mt-4">
            <Link href="/manager/master">
              <ShieldCheck className="h-4 w-4" />
              Ir para Master
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function getCompanyDisplayName(
  user: CurrentUser | null,
  masterCompanyScope: MasterCompanyScope | null,
  mode: "manager" | "client",
) {
  if (hasMasterAccess(user) && mode === "client") {
    return (
      masterCompanyScope?.trade_name ||
      masterCompanyScope?.name ||
      "Selecione no Master"
    );
  }

  if (hasMasterAccess(user) && mode === "manager") {
    return (
      masterCompanyScope?.trade_name ||
      masterCompanyScope?.name ||
      "Gestão Master"
    );
  }

  return (
    user?.company?.trade_name ||
    user?.company?.name ||
    user?.company_trade_name ||
    user?.company_name ||
    "Empresa"
  );
}
