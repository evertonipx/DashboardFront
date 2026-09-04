"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Building2,
  Camera,
  ChartNoAxesCombined,
  ChevronRight,
  FileText,
  Filter,
  History,
  Eye,
  LogOut,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/app/auth-provider";
import { ThemeToggle } from "@/components/app/theme-provider";
import { usePremiumShellMotion } from "@/components/app/use-premium-motion";
import { hasMasterAccess } from "@/lib/access";
import {
  cancelScheduledAppRoutePreload,
  preloadAppRoute,
  scheduleAppRoutePreload,
  type AppDashboardModule,
} from "@/lib/app-route-preload";
import { requestLiveRefresh } from "@/lib/live-refresh";
import {
  getEffectiveCompanyScopeId,
  getUserViewScopedStorageKey,
  getStoredMasterCompanyScope,
  MASTER_COMPANY_SCOPE_EVENT,
  type MasterCompanyScope,
} from "@/lib/master-company-scope";
import {
  canAccessOperationalDashboards,
  canManageCameras,
  canManageLocations,
  canManageScenarioCatalogs,
  canManageViews,
  canManageWorkers,
  canViewAudit,
  canViewCounting,
  canViewDemographics,
  canViewOccupancy,
} from "@/lib/permissions";
import { cn, initials } from "@/lib/utils";
import type { CurrentUser } from "@/lib/types";
import { USER_GRID_HYDRATED_EVENT } from "@/lib/user-grid";
import {
  claimLegacyUserGridPreference,
  hasUserGridKnownDeletion,
  writeUserGridPreference,
} from "@/lib/user-grid-local";

type AppShellProps = {
  mode: "manager" | "client";
  children: React.ReactNode;
  title?: string;
  description?: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  canShow?: (user: CurrentUser | null) => boolean;
};

const clientNavItems: NavItem[] = [
  {
    href: "/dashboard/live",
    label: "Ao Vivo",
    icon: Activity,
    canShow: canAccessOperationalDashboards,
  },
  {
    href: "/dashboard/analytics",
    label: "Análises",
    icon: ChartNoAxesCombined,
    canShow: canAccessOperationalDashboards,
  },
  {
    href: "/dashboard/reports",
    label: "Relatórios",
    icon: FileText,
    canShow: canAccessOperationalDashboards,
  },
];

const managerNavItems: NavItem[] = [
  {
    href: "/manager/live",
    label: "Ao Vivo",
    icon: Activity,
    canShow: canAccessOperationalDashboards,
  },
  {
    href: "/manager/analytics",
    label: "Análises",
    icon: ChartNoAxesCombined,
    canShow: canAccessOperationalDashboards,
  },
  {
    href: "/manager/reports",
    label: "Relatórios",
    icon: FileText,
    canShow: canAccessOperationalDashboards,
  },
  {
    href: "/manager/audit",
    label: "Auditoria",
    icon: History,
    canShow: canViewAudit,
  },
  {
    href: "/manager/views",
    label: "Visões",
    icon: Eye,
    canShow: canManageViews,
  },
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
    label: "Locais",
    icon: MapPinned,
    canShow: canManageLocations,
  },
  {
    href: "/manager/scenarios",
    label: "Cenários",
    icon: Filter,
    canShow: canManageScenarioCatalogs,
  },
];

const masterNavItem = { href: "/manager/master", label: "Superadmin", icon: ShieldCheck };
const SIDEBAR_COLLAPSED_STORAGE_KEY = "ipxdata.sidebar-collapsed.v1";
const PAGE_PRESENTATIONS: Record<
  "client" | "manager",
  Record<string, { title: string; description: string }>
> = {
  client: {
    "/dashboard/analytics": {
      title: "Análises",
      description: "Análise de contagem, ocupação e perfil demográfico por período.",
    },
    "/dashboard/live": {
      title: "Ao Vivo",
      description: "Contagem, ocupação e perfil demográfico em tempo real.",
    },
    "/dashboard/occupancy": {
      title: "Ocupação Ao Vivo",
      description:
        "Ocupação em tempo real, agregados e alertas sempre pela configuração do cenário.",
    },
    "/dashboard/reports": {
      title: "Relatórios",
      description: "Relatórios de contagem, ocupação e perfil demográfico por período.",
    },
  },
  manager: {
    "/manager/analytics": {
      title: "Análises",
      description:
        "Análises configuráveis de contagem, ocupação e perfil demográfico.",
    },
    "/manager/audit": {
      title: "Auditoria",
      description:
        "Consulte alterações operacionais registradas para a empresa selecionada.",
    },
    "/manager/cameras": {
      title: "Câmeras",
      description: "Organize as câmeras e as linhas usadas nas contagens.",
    },
    "/manager/live": {
      title: "Ao Vivo",
      description: "Contagem, ocupação e perfil demográfico em tempo real.",
    },
    "/manager/locations": {
      title: "Locais",
      description: "Organize unidades, setores e suas câmeras.",
    },
    "/manager/master": {
      title: "Central do Superadmin",
      description:
        "Gerencie empresas, usuários, acessos, módulos e inteligência artificial em um único lugar.",
    },
    "/manager/occupancy": {
      title: "Ocupação Ao Vivo",
      description:
        "Gestão da ocupação em tempo real, agregados e alertas por cenário de áreas.",
    },
    "/manager/reports": {
      title: "Relatórios",
      description:
        "Contagem, ocupação e perfil demográfico consolidados por período.",
    },
    "/manager/scenarios": {
      title: "Cenários",
      description: "Crie e ajuste as regras que alimentam os relatórios.",
    },
    "/manager/views": {
      title: "Visões",
      description:
        "Configure visões autenticadas e distribua o Ao Vivo em um ou mais monitores.",
    },
    "/manager/workers": {
      title: "Workers",
      description:
        "Gerencie os Workers responsáveis pelo processamento dos dados da empresa.",
    },
  },
};

export function AppShell({
  mode,
  children,
  title,
  description,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const shellRef = React.useRef<HTMLDivElement>(null);
  const isMaster = hasMasterAccess(user);
  const [masterCompanyScope, setMasterCompanyScope] =
    React.useState<MasterCompanyScope | null>(null);
  const [masterScopeReady, setMasterScopeReady] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const sidebarStorageKey = getUserViewScopedStorageKey(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    null,
    user?.id,
  );
  const companyName = getCompanyDisplayName(user, masterCompanyScope, mode);
  const effectiveCompanyScopeId = isMaster
    ? masterCompanyScope?.id ?? ""
    : getEffectiveCompanyScopeId(user);
  const isMasterWorkspace =
    isMaster && mode === "manager" && pathname === "/manager/master";
  const visibleClientNavItems = clientNavItems.filter(
    (item) => !item.canShow || item.canShow(user),
  );
  const fallbackDashboardModule: AppDashboardModule | undefined =
    canViewCounting(user)
      ? "counting"
      : canViewOccupancy(user)
        ? "occupancy"
        : canViewDemographics(user)
          ? "demographics"
          : undefined;
  const navItems =
    mode === "manager"
      ? [
          ...(isMaster ? [masterNavItem] : []),
          ...managerNavItems.filter((item) => !item.canShow || item.canShow(user)),
        ]
      : isMaster
        ? [masterNavItem, ...visibleClientNavItems]
        : visibleClientNavItems;
  const pagePresentation = PAGE_PRESENTATIONS[mode][pathname];
  const pageTitle =
    title ?? pagePresentation?.title ?? (mode === "manager" ? "Gestão" : "Painel");
  const pageDescription =
    description ?? pagePresentation?.description ??
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

  React.useEffect(() => {
    if (isMasterWorkspace) return;

    const userId = user?.id?.trim() ?? "";
    const companyId = effectiveCompanyScopeId.trim();
    if (!userId || !companyId) return;

    let active = true;
    void import("@/lib/legacy-dashboard-view-migration").then(
      ({ migrateLegacyDashboardDefaults }) =>
        migrateLegacyDashboardDefaults({
          companyId,
          shouldApply: () =>
            active && getEffectiveCompanyScopeId(user) === companyId,
          userId,
        }),
    ).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [effectiveCompanyScopeId, isMasterWorkspace, user]);

  React.useEffect(() => {
    const synchronizeSidebar = () => {
      let storedPreference: string | null = null;
      try {
        storedPreference = window.localStorage.getItem(sidebarStorageKey);
        if (
          storedPreference === null &&
          sidebarStorageKey !== SIDEBAR_COLLAPSED_STORAGE_KEY &&
          user?.id &&
          !hasUserGridKnownDeletion(sidebarStorageKey)
        ) {
          storedPreference = claimLegacyUserGridPreference(
            SIDEBAR_COLLAPSED_STORAGE_KEY,
            user.id,
          );
          if (storedPreference !== null) {
            writeUserGridPreference(sidebarStorageKey, storedPreference);
          }
        }
      } catch {
        // The responsive default remains available when storage is blocked.
      }
      setSidebarCollapsed(
        storedPreference === null
          ? window.matchMedia("(max-width: 1279px)").matches
          : storedPreference === "true",
      );
    };
    const synchronizeSidebarFromStorage = (event: StorageEvent) => {
      if (event.key && event.key !== sidebarStorageKey) return;
      synchronizeSidebar();
    };

    synchronizeSidebar();
    window.addEventListener(USER_GRID_HYDRATED_EVENT, synchronizeSidebar);
    window.addEventListener("storage", synchronizeSidebarFromStorage);
    return () => {
      window.removeEventListener(USER_GRID_HYDRATED_EVENT, synchronizeSidebar);
      window.removeEventListener("storage", synchronizeSidebarFromStorage);
    };
  }, [sidebarStorageKey, user?.id]);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      writeUserGridPreference(sidebarStorageKey, String(next));
      return next;
    });
  }

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
  const contentKey =
    isMasterWorkspace
      ? `master-workspace-${user?.id ?? "anonymous"}`
      : isMaster
        ? masterCompanyScope?.id ?? "master-no-company-scope"
        : "tenant-user";

  return (
    <div ref={shellRef} className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only z-[110] rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Pular para o conteúdo principal
      </a>
      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-border bg-card text-card-foreground transition-[width] duration-200 lg:flex",
          !sidebarCollapsed && "lg:w-64",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center justify-center gap-3 border-b border-border px-2",
            !sidebarCollapsed && "lg:justify-start lg:px-4",
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-foreground shadow-sm">
            IPX
          </div>
          <div
            className={cn(
              "hidden min-w-0",
              !sidebarCollapsed && "lg:block",
            )}
          >
            <div className="text-base font-semibold tracking-normal">IPXData</div>
            <div className="text-xs text-muted-foreground">Inteligência de dados</div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute -right-3 top-[18px] z-10 hidden h-7 w-7 rounded-full bg-card shadow-sm lg:inline-flex"
          onClick={toggleSidebar}
          aria-controls="app-sidebar"
          aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </Button>

        <div
          className={cn(
            "hidden px-4 py-4",
            !sidebarCollapsed && "lg:block",
          )}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Empresa
          </div>
          <div className="mt-1 truncate text-sm font-medium text-foreground">
            {companyName}
          </div>
        </div>

        <nav
          className={cn(
            "min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pt-4",
            !sidebarCollapsed && "lg:pt-0",
          )}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            const liveItem = item.href.endsWith("/live");

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                onClick={() => {
                  if (liveItem) requestLiveRefresh();
                }}
                onBlur={() => cancelScheduledAppRoutePreload(item.href)}
                onFocus={() =>
                  scheduleAppRoutePreload(
                    item.href,
                    fallbackDashboardModule,
                    140,
                    () => router.prefetch(item.href),
                  )
                }
                onPointerDown={() => {
                  router.prefetch(item.href);
                  preloadAppRoute(item.href, fallbackDashboardModule);
                }}
                onPointerEnter={() =>
                  scheduleAppRoutePreload(
                    item.href,
                    fallbackDashboardModule,
                    140,
                    () => router.prefetch(item.href),
                  )
                }
                onPointerLeave={() => cancelScheduledAppRoutePreload(item.href)}
                className={cn(
                  "relative flex items-center justify-center overflow-hidden rounded-md px-2 py-2.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:justify-between lg:px-3",
                  sidebarCollapsed &&
                    "lg:justify-center lg:px-2",
                  active && "bg-primary/10 font-medium text-primary",
                )}
                title={item.label}
                data-premium-hover
                data-premium-nav-item
              >
                <span
                  className={cn(
                    "flex items-center gap-0",
                    !sidebarCollapsed && "lg:gap-3",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span
                    className={cn(
                      "hidden",
                      !sidebarCollapsed && "lg:inline",
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                <ChevronRight
                  className={cn(
                    "hidden h-4 w-4 text-muted-foreground/60",
                    !sidebarCollapsed && "lg:block",
                  )}
                />
                <NavigationPendingIndicator />
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "mt-auto px-2 pb-5",
            !sidebarCollapsed && "lg:px-4",
          )}
        >
          <Separator className="mb-4 bg-border" />
          <div
            className={cn(
              "mb-4 flex items-center justify-center gap-3",
              !sidebarCollapsed && "lg:justify-start",
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
              {initials(user?.name)}
            </div>
            <div
              className={cn(
                "hidden min-w-0",
                !sidebarCollapsed && "lg:block",
              )}
            >
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "w-full justify-center px-0 text-muted-foreground hover:bg-secondary hover:text-foreground",
              !sidebarCollapsed && "lg:justify-start lg:px-4",
            )}
            onClick={logout}
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
            <span
              className={cn(
                "hidden",
                !sidebarCollapsed && "lg:inline",
              )}
            >
              Sair
            </span>
          </Button>
          <ThemeToggle
            className={cn(
              "mt-2 w-full text-muted-foreground hover:bg-secondary hover:text-foreground",
              !sidebarCollapsed && "lg:hidden",
            )}
          />
          <ThemeToggle
            showLabel
            className={cn(
              "mt-2 hidden text-muted-foreground hover:bg-secondary hover:text-foreground",
              !sidebarCollapsed && "lg:flex",
            )}
          />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
              IPX
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">IPXData</div>
              <div className="truncate text-xs text-muted-foreground">{pageTitle}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav
          aria-label="Navegação principal em telas estreitas"
          className="enterprise-horizontal-scroll mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            const liveItem = item.href.endsWith("/live");

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                onClick={() => {
                  if (liveItem) requestLiveRefresh();
                }}
                onBlur={() => cancelScheduledAppRoutePreload(item.href)}
                onFocus={() =>
                  scheduleAppRoutePreload(
                    item.href,
                    fallbackDashboardModule,
                    140,
                    () => router.prefetch(item.href),
                  )
                }
                onPointerDown={() => {
                  router.prefetch(item.href);
                  preloadAppRoute(item.href, fallbackDashboardModule);
                }}
                onPointerEnter={() =>
                  scheduleAppRoutePreload(
                    item.href,
                    fallbackDashboardModule,
                    140,
                    () => router.prefetch(item.href),
                  )
                }
                onPointerLeave={() => cancelScheduledAppRoutePreload(item.href)}
                className={cn(
                  "relative inline-flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-md border bg-card px-3 py-2 text-xs font-medium",
                  active && "border-primary/30 bg-primary/10 text-primary",
                )}
                data-premium-hover
                data-premium-nav-item
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
                <NavigationPendingIndicator />
              </Link>
            );
          })}
        </nav>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "min-w-0 transition-[padding] duration-200 lg:pl-20",
          !sidebarCollapsed && "lg:pl-64",
        )}
      >
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
          <div
            key={contentKey}
            className="min-w-0 max-w-full"
            data-premium-content
          >
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavigationPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-2 bottom-0 h-0.5 origin-left rounded-full bg-primary opacity-0",
        pending && "animate-pulse opacity-100",
      )}
    />
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
            Os painéis e cadastros operacionais pertencem a uma empresa.
            Escolha a empresa no Superadmin antes de acessar essas telas.
          </p>
          <Button asChild className="mt-4">
            <Link href="/manager/master">
              <ShieldCheck className="h-4 w-4" />
              Ir para Superadmin
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
      "Selecione uma empresa"
    );
  }

  if (hasMasterAccess(user) && mode === "manager") {
    return (
      masterCompanyScope?.trade_name ||
      masterCompanyScope?.name ||
      "Gestão de empresas"
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
