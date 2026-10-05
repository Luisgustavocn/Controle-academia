"use client";

import Link from "next/link";
import { ComponentType, PropsWithChildren, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, CalendarCheck2, CalendarClock, CreditCard, LayoutDashboard,
  LogOut, Menu, Package, PanelLeftClose, PanelLeftOpen, Settings, ShoppingBag, Users2, Wallet
} from "lucide-react";
import { clsx } from "clsx";
import { SessionUser } from "@/lib/auth/session";
import { BrandingConfig } from "@/lib/services/branding";
import { filterNavigationByCapabilities, findNavigationItem, type NavigationIcon } from "@/lib/navigation";
import { getCapabilitiesForRole } from "@/lib/auth/capabilities";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { CapabilityProvider } from "@/components/capability-provider";

const iconByName: Record<NavigationIcon, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  dashboard: LayoutDashboard,
  students: Users2,
  attendance: CalendarCheck2,
  schedule: CalendarClock,
  monthlies: CreditCard,
  cash: Wallet,
  expenses: Building2,
  products: Package,
  sales: ShoppingBag,
  reports: BarChart3,
  settings: Settings
};

const roleLabels: Record<SessionUser["role"], string> = {
  ADMIN: "Administrador",
  FINANCEIRO: "Financeiro",
  RECEPCAO: "Recepção",
  PERSONAL: "Personal"
};

type ShellNavigationProps = {
  groups: ReturnType<typeof filterNavigationByCapabilities>;
  pathname: string;
  compact?: boolean;
  onNavigate?: () => void;
};

function ShellNavigation({ groups, pathname, compact, onNavigate }: ShellNavigationProps) {
  return (
    <nav aria-label="Navegação principal" className="space-y-5">
      {groups.map((group) => {
        const groupId = `nav-${group.label.toLowerCase().replace(/\W+/g, "-")}`;
        return (
          <section key={group.label} aria-labelledby={groupId}>
            <h2 id={groupId} className={clsx("mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/45", compact && "sr-only")}>
              {group.label}
            </h2>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = iconByName[item.icon];
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={compact ? item.label : undefined}
                    onClick={onNavigate}
                    className={clsx(
                      "group flex min-h-10 items-center rounded-ds-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                      compact ? "justify-center px-2" : "gap-3 px-3",
                      active ? "bg-white text-sidebar shadow-surface-sm" : "text-white/72 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden />
                    {!compact ? <span className="truncate font-medium">{item.label}</span> : null}
                  </Link>
                );
                return compact ? <Tooltip key={item.href} content={item.label} side="right">{link}</Tooltip> : <div key={item.href}>{link}</div>;
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
  window.location.replace("/login");
}

export function LayoutShell({ children, user, branding }: PropsWithChildren<{ user: SessionUser; branding: BrandingConfig }>) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const capabilities = useMemo(() => getCapabilitiesForRole(user.role), [user.role]);
  const groups = useMemo(() => filterNavigationByCapabilities(capabilities), [capabilities]);
  const current = findNavigationItem(pathname);

  if (pathname === "/login") return <>{children}</>;

  return (
    <CapabilityProvider capabilities={capabilities}>
    <div className="min-h-screen bg-bg text-ink">
      <aside className={clsx("fixed inset-y-0 left-0 z-40 hidden border-r border-sidebarLine bg-sidebar text-white transition-[width] duration-200 md:flex md:w-20 md:flex-col", collapsed ? "xl:w-20" : "xl:w-72")}>
        <div className={clsx("flex h-[4.75rem] items-center border-b border-white/10 px-3", collapsed ? "justify-center" : "justify-center xl:justify-start xl:gap-3 xl:px-5")}>
          <Avatar src={branding.logoUrl} name={branding.academyName} alt={branding.academyName} size="md" className="border-white/20" />
          {!collapsed ? <div className="hidden min-w-0 xl:block"><p className="truncate text-sm font-semibold text-white">{branding.academyName}</p><p className="text-xs text-white/50">Painel de gestão</p></div> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          <div className={clsx(!collapsed && "xl:hidden")}><ShellNavigation groups={groups} pathname={pathname} compact /></div>
          {!collapsed ? <div className="hidden xl:block"><ShellNavigation groups={groups} pathname={pathname} /></div> : null}
        </div>

        <div className="border-t border-white/10 p-3">
          <div className={clsx("flex items-center", collapsed ? "justify-center" : "justify-center xl:justify-start xl:gap-3")}>
            <Avatar name={user.name} size="sm" className="border-white/20 bg-white/10 text-white" />
            {!collapsed ? <div className="hidden min-w-0 xl:block"><p className="truncate text-sm font-medium text-white">{user.name}</p><p className="truncate text-xs text-white/50">{roleLabels[user.role]}</p></div> : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((value) => !value)}
            className="mt-3 hidden w-full border-white/10 text-white/65 hover:bg-white/10 hover:text-white xl:inline-flex"
            leadingIcon={collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          >
            {!collapsed ? "Recolher" : null}
          </Button>
        </div>
      </aside>

      <div className={clsx("min-h-screen transition-[margin] duration-200 md:ml-20", collapsed ? "xl:ml-20" : "xl:ml-72")}>
        <header className="sticky top-0 z-30 flex min-h-[4.75rem] items-center justify-between gap-3 border-b border-line bg-card/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu principal"><Menu className="h-5 w-5" aria-hidden="true" /></Button>
            <div className="min-w-0">
              {current ? <p className="text-xs font-medium text-muted">{current.group}</p> : null}
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{current?.label ?? branding.academyName}</h1>
            </div>
          </div>

          <DropdownMenu
            label="Menu da conta"
            align="end"
            trigger={<span className="flex min-w-0 items-center gap-2"><Avatar name={user.name} size="sm" /><span className="hidden min-w-0 text-left sm:block"><span className="block max-w-40 truncate text-sm font-semibold">{user.name}</span><span className="block text-xs text-muted">{roleLabels[user.role]}</span></span></span>}
          >
            <div className="px-3 py-2"><p className="truncate text-sm font-semibold text-ink">{user.name}</p><p className="truncate text-xs text-muted">{user.email}</p><Badge className="mt-2">{roleLabels[user.role]}</Badge></div>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void logout()}><LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair</DropdownMenuItem>
          </DropdownMenu>
        </header>

        <main className="mx-auto w-full max-w-[100rem] p-4 sm:p-6">{children}</main>
      </div>

      <Drawer open={mobileOpen} onOpenChange={setMobileOpen} side="left" title={branding.academyName} description={roleLabels[user.role]}>
        <div className="rounded-ds-xl bg-sidebar p-3 text-white"><ShellNavigation groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} /></div>
      </Drawer>
    </div>
    </CapabilityProvider>
  );
}
