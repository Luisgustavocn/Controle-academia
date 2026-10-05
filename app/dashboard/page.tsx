import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, CircleDollarSign, Clock3, CreditCard, UserCheck, UserPlus, Users, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { FinanceEvolutionChart } from "@/components/charts/finance-evolution-chart";
import { getActiveSessionUser } from "@/lib/auth/server-session";
import { hasCapability } from "@/lib/auth/capabilities";
import { getOperationalDashboard, type DashboardRecentItem } from "@/lib/services/dashboard";
import { ACADEMY_TIME_ZONE } from "@/lib/timezone";

function currency(value = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: ACADEMY_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-ds-lg border border-line bg-bg/55 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ds-lg bg-card text-accent shadow-surface-sm" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="mt-0.5 text-xl font-black text-ink">{value}</p>
        {detail ? <p className="mt-0.5 text-xs text-muted">{detail}</p> : null}
      </div>
    </div>
  );
}

function RecentList({ items, emptyTitle }: { items: DashboardRecentItem[]; emptyTitle: string }) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description="Os registros aparecerão aqui quando existirem." className="py-6" />;
  }
  return (
    <ul className="divide-y divide-line" aria-label="Movimentações recentes">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accentDark" aria-hidden="true">
            {item.kind === "payment" ? <CircleDollarSign className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
            <p className="text-xs text-muted">{item.detail} · {dateTime(item.occurredAt)}</p>
          </div>
          <div className="shrink-0 text-right">
            {item.amount !== undefined ? <p className="text-sm font-bold text-ink">{currency(item.amount)}</p> : null}
            {item.status ? <StatusBadge status={item.status} className="mt-1" /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const actionClass = "inline-flex min-h-control-md items-center justify-center gap-2 rounded-ds-lg border border-line bg-card px-3 text-sm font-semibold text-ink shadow-surface-sm transition-colors hover:border-accent/40 hover:bg-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export default async function DashboardPage() {
  const session = await getActiveSessionUser();
  if (!session) redirect("/login");
  if (!hasCapability(session.role, "dashboard.view")) redirect("/frequencia");

  const dashboard = await getOperationalDashboard(session.role);
  const actions = [
    hasCapability(session.role, "students.create") ? { href: "/alunos", label: "Novo aluno", icon: <UserPlus className="h-4 w-4" /> } : null,
    hasCapability(session.role, "attendance.write") ? { href: "/frequencia", label: "Confirmar presença", icon: <UserCheck className="h-4 w-4" /> } : null,
    hasCapability(session.role, "finance.monthlies.manage") ? { href: "/mensalidades", label: "Registrar pagamento", icon: <CreditCard className="h-4 w-4" /> } : null,
    hasCapability(session.role, "sales.create") ? { href: "/pedidos", label: "Registrar venda", icon: <WalletCards className="h-4 w-4" /> } : null
  ].filter((action): action is NonNullable<typeof action> => Boolean(action));
  const recentPayments = dashboard.recent?.payments ?? [];
  const recentStudents = dashboard.recent?.students ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" description="Visão geral da academia" breadcrumbs={[{ label: "Início" }, { label: "Dashboard" }]} secondaryActions={<p className="text-sm font-medium text-muted">{dashboard.asOf.label}</p>} />

      <section aria-labelledby="overview-title">
        <h2 id="overview-title" className="sr-only">Situação geral</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Alunos ativos" value={String(dashboard.overview.activeStudents ?? 0)} subtitle="Cadastros com status ativo" icon={<Users className="h-4 w-4" />} />
          <KpiCard title="Recebido no mês" value={currency(dashboard.overview.receivedMonth)} subtitle="Mensalidades e vendas recebidas" icon={<CircleDollarSign className="h-4 w-4" />} />
          <KpiCard title="A receber" value={currency(dashboard.overview.receivableCurrent)} subtitle="Pendentes/atrasadas do mês; parcial não inferido" icon={<Clock3 className="h-4 w-4" />} />
          <KpiCard title="Inadimplentes" value={String(dashboard.overview.delinquentStudents ?? 0)} subtitle="Alunos únicos com atraso" icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
      </section>

      {dashboard.today ? (
        <Card aria-labelledby="today-title">
          <CardHeader><CardTitle id="today-title">Hoje</CardTitle><CardDescription>Operação do dia civil em {ACADEMY_TIME_ZONE}.</CardDescription></CardHeader>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.today.attendances !== undefined ? <Metric label="Presenças" value={String(dashboard.today.attendances)} icon={<UserCheck className="h-4 w-4" />} /> : null}
            {dashboard.today.appointments !== undefined ? <Metric label="Agendamentos" value={String(dashboard.today.appointments)} icon={<CalendarClock className="h-4 w-4" />} /> : null}
            {dashboard.today.due ? <Metric label="Vencendo hoje" value={String(dashboard.today.due.count)} detail={currency(dashboard.today.due.amount)} icon={<Clock3 className="h-4 w-4" />} /> : null}
            {dashboard.today.received !== undefined ? <Metric label="Recebido hoje" value={currency(dashboard.today.received)} icon={<CircleDollarSign className="h-4 w-4" />} /> : null}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]">
        {dashboard.attention ? (
          <Card aria-labelledby="attention-title">
            <CardHeader><CardTitle id="attention-title">Precisa de atenção</CardTitle><CardDescription>Pendências que merecem acompanhamento.</CardDescription></CardHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {dashboard.attention.overdue ? <Metric label="Alunos inadimplentes" value={String(dashboard.attention.overdue.students)} detail={`${currency(dashboard.attention.overdue.amount)} em aberto`} icon={<AlertTriangle className="h-4 w-4" />} /> : null}
              {dashboard.attention.noRecentAttendance ? <Metric label={`Sem frequência há ${dashboard.attention.noRecentAttendance.thresholdDays} dias`} value={String(dashboard.attention.noRecentAttendance.students)} detail="Somente alunos ativos com histórico" icon={<UserCheck className="h-4 w-4" />} /> : null}
            </div>
          </Card>
        ) : null}

        {actions.length > 0 ? (
          <Card aria-labelledby="actions-title">
            <CardHeader><CardTitle id="actions-title">Ações rápidas</CardTitle><CardDescription>Acessos permitidos para o seu perfil.</CardDescription></CardHeader>
            <nav className="grid gap-2" aria-label="Ações rápidas do Dashboard">
              {actions.map((action) => <Link key={action.href} href={action.href} className={actionClass}>{action.icon}{action.label}</Link>)}
            </nav>
          </Card>
        ) : null}
      </div>

      {dashboard.recent ? (
        <Card aria-labelledby="recent-title">
          <CardHeader><CardTitle id="recent-title">Movimentação recente</CardTitle><CardDescription>Últimos registros disponíveis para o seu perfil.</CardDescription></CardHeader>
          <div className={`grid gap-6 ${recentPayments.length > 0 && recentStudents.length > 0 ? "lg:grid-cols-2" : ""}`}>
            {dashboard.recent.payments ? <div><h3 className="mb-3 text-sm font-bold text-ink">Pagamentos</h3><RecentList items={recentPayments} emptyTitle="Nenhum pagamento recente" /></div> : null}
            {dashboard.recent.students ? <div><h3 className="mb-3 text-sm font-bold text-ink">Novos alunos</h3><RecentList items={recentStudents} emptyTitle="Nenhum aluno recente" /></div> : null}
          </div>
        </Card>
      ) : null}

      {dashboard.financialSeries ? (
        <Card aria-labelledby="financial-title">
          <CardHeader><CardTitle id="financial-title">Receitas e despesas</CardTitle><CardDescription>Comparativo financeiro agregado dos últimos 12 meses.</CardDescription></CardHeader>
          <figure aria-labelledby="financial-title" aria-describedby="financial-description">
            <p id="financial-description" className="sr-only">Gráfico de linhas com receita, despesa e saldo por competência.</p>
            <FinanceEvolutionChart data={dashboard.financialSeries} />
          </figure>
        </Card>
      ) : null}
    </div>
  );
}
