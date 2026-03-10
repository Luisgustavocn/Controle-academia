import Link from "next/link";
import { PropsWithChildren } from "react";
import { SessionUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";

const links = [
  ["/dashboard", "Dashboard"],
  ["/alunos", "Alunos"],
  ["/mensalidades", "Mensalidades"],
  ["/caixa", "Caixa"],
  ["/despesas-academia", "Despesas academia"],
  ["/despesas-familia", "Despesas família"],
  ["/frequencia", "Frequência"],
  ["/agenda-personal", "Agenda personal"],
  ["/produtos", "Produtos"],
  ["/pedidos", "Pedidos"],
  ["/relatorios", "Relatórios"],
  ["/configuracoes", "Configurações"]
];

export function LayoutShell({ children, user }: PropsWithChildren<{ user: SessionUser }>) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[230px_1fr]">
      <aside className="border-r border-line bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Controle Academia</p>
        <h1 className="mt-1 text-lg font-bold text-ink">Gestão 2026</h1>

        <nav className="mt-6 flex flex-col gap-1">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm text-muted transition hover:bg-accentSoft hover:text-accentDark">
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="p-4 md:p-6">
        <header className="mb-6 flex items-center justify-between rounded-xl border border-line bg-card p-3">
          <div>
            <p className="text-sm font-semibold text-ink">{user.name}</p>
            <p className="text-xs text-muted">{user.email} · {user.role}</p>
          </div>
          <LogoutButton />
        </header>
        {children}
      </main>
    </div>
  );
}
