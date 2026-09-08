"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Building2, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";

type MobileNavigationProps = {
  pageTitle: string;
  companyName: string;
  userName?: string;
  userEmail?: string;
  pathname: string;
  children: (closeMenu: () => void) => React.ReactNode;
  accountActions: React.ReactNode;
};

export function MobileNavigation({
  pageTitle,
  companyName,
  userName,
  userEmail,
  pathname,
  children,
  accountActions,
}: MobileNavigationProps) {
  const [open, setOpen] = React.useState(false);
  const closeMenu = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) closeMenu();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [closeMenu]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 py-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
              IPX
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">IPXData</div>
              <div className="text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                {pageTitle}
              </div>
            </div>
          </div>
          <DialogPrimitive.Trigger asChild>
            <Button type="button" variant="outline" className="h-11 shrink-0 gap-2 px-3" aria-label="Abrir menu">
              <Menu aria-hidden="true" />
              Menu
            </Button>
          </DialogPrimitive.Trigger>
        </div>
      </header>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-mobile-navigation-overlay=""
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none lg:hidden"
        />
        <DialogPrimitive.Content
          data-mobile-navigation-panel=""
          className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] min-w-0 w-[calc(100%-1rem)] max-w-sm flex-col overflow-hidden border-r border-border bg-card text-card-foreground shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left motion-reduce:animate-none lg:hidden"
          onCloseAutoFocus={(event) => {
            // A resize must not return focus to the now-hidden mobile trigger.
            if (window.matchMedia("(min-width: 1024px)").matches) {
              event.preventDefault();
              document.getElementById("main-content")?.focus({ preventScroll: true });
            }
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex min-w-0 items-center gap-3">
              <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
                IPX
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold">IPXData</div>
                <DialogPrimitive.Title className="text-xs font-medium text-muted-foreground">
                  Menu principal
                </DialogPrimitive.Title>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Fechar menu">
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Description className="sr-only">
            Navegue pelas áreas disponíveis para sua conta.
          </DialogPrimitive.Description>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-3">
            {companyName ? (
              <div className="flex min-w-0 shrink-0 items-start gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Building2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{companyName}</span>
              </div>
            ) : null}

            <nav aria-label="Navegação principal em telas pequenas" className="min-w-0 flex-1 space-y-1 py-2">
              {children(closeMenu)}
            </nav>

            <div className="mt-4 min-w-0 shrink-0 border-t border-border pt-4">
              <div className="mb-3 flex min-w-0 items-start gap-3 px-3">
                <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(userName || "Usuário")}
                </div>
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <div className="text-sm font-medium">{userName || "Usuário"}</div>
                  {userEmail ? <div className="text-xs text-muted-foreground">{userEmail}</div> : null}
                </div>
              </div>
              <div className="grid min-w-0 gap-1 [&>button]:h-auto [&>button]:min-h-11 [&>button]:w-full [&>button]:justify-start [&>button]:whitespace-normal [&>button]:text-left">
                {accountActions}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
