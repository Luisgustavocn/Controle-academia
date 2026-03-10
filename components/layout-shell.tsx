"use client";

import Link from "next/link";
import { ComponentType, PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Users2,
  Wallet,
  Building2
} from "lucide-react";
import { SessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";
import { BrandingConfig } from "@/lib/services/branding";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const links: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alunos", label: "Alunos", icon: Users2 },
  { href: "/mensalidades", label: "Mensalidades", icon: CreditCard },
  { href: "/caixa", label: "Caixa", icon: Wallet },
  { href: "/despesas-academia", label: "Despesas academia", icon: Building2 },
  { href: "/frequencia", label: "Frequência", icon: CalendarCheck2 },
  { href: "/agenda-personal", label: "Agenda personal", icon: CalendarClock },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", icon: Settings }
];

export function LayoutShell({ children, user, branding }: PropsWithChildren<{ user: SessionUser; branding: BrandingConfig }>) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-transparent">
      <aside className="relative overflow-hidden border-b border-sidebarLine bg-sidebar p-4 text-white md:fixed md:inset-y-0 md:left-0 md:z-40 md:w-[260px] md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[rgba(255,80,97,0.25)] blur-2xl" />
        <div className="pointer-events-none absolute -left-10 bottom-20 h-24 w-24 rounded-full bg-[rgba(255,176,183,0.14)] blur-2xl" />

        <div className="mb-5 flex justify-center">
          <img
            src={branding.logoUrl}
            alt={branding.academyName}
            className="h-[98px] w-[98px] rounded-full border border-white/30 object-cover shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
          />
        </div>

        <nav className="flex flex-col gap-1.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? "flex items-center gap-2.5 rounded-xl border border-white/20 bg-[rgba(255,255,255,0.12)] px-3 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(0,0,0,0.24)]"
                    : "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 transition hover:bg-[rgba(255,255,255,0.1)] hover:text-white"
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="p-4 md:ml-[260px] md:p-6">
        <header className="mb-6 flex items-center justify-between rounded-2xl border border-white/75 bg-[rgba(255,255,255,0.82)] p-4 shadow-[0_10px_30px_rgba(49,20,25,0.09)] backdrop-blur-sm">
          <div>
            <p className="text-sm font-bold tracking-tight text-ink">{user.name}</p>
            <p className="text-xs font-medium text-muted">{user.email} · {user.role}</p>
          </div>
          <LogoutButton />
        </header>
        {children}
      </main>
    </div>
  );
}
