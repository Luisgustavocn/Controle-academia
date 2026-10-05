import { ModuleHeader } from "@/components/ui/module-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card } from "@/components/ui/card";
import { FinanceEvolutionChart } from "@/components/charts/finance-evolution-chart";
import { currentCompetencia } from "@/lib/competencia";
import { getDashboardSummary } from "@/lib/services/dashboard";
import { LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";
import { getActiveSessionUser } from "@/lib/auth/server-session";
import { hasCapability } from "@/lib/auth/capabilities";

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 }).format(value);
}

export default async function DashboardPage() {
  const session = await getActiveSessionUser();
  if (!session) {
    redirect("/login");
  }

  if (!hasCapability(session.role, "dashboard.view")) {
    redirect("/frequencia");
  }

  const summary = await getDashboardSummary(currentCompetencia());

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Dashboard"
        description="Visão gerencial com KPIs de receita, despesas, alunos e frequência."
        icon={LayoutDashboard}
        badges={["Visão executiva", "Atualização automática", "Últimos 12 meses"]}
        stats={[
          { label: "Competência", value: currentCompetencia() },
          { label: "Saldo do mês", value: currency(summary.kpis.saldo_mes) }
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Alunos ativos" value={String(summary.kpis.alunos_ativos)} />
        <KpiCard title="Inadimplentes" value={String(summary.kpis.alunos_inadimplentes)} />
        <KpiCard title="Receita do mês" value={currency(summary.kpis.receita_mes)} />
        <KpiCard title="Despesa do mês" value={currency(summary.kpis.despesa_mes)} />
        <KpiCard title="Saldo do mês" value={currency(summary.kpis.saldo_mes)} />
        <KpiCard title="Novas matrículas" value={String(summary.kpis.novas_matriculas_mes)} />
        <KpiCard title="Cancelamentos" value={String(summary.kpis.cancelamentos_mes)} />
        <KpiCard title="Frequência total" value={String(summary.kpis.frequencia_total_mes)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-1 text-xl font-black text-ink">Evolução financeira</h2>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">Últimos 12 meses</p>
          <FinanceEvolutionChart data={summary.series} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-xl font-black text-ink">Indicadores</h2>
          <ul className="space-y-2 text-sm">
            <li>Ticket médio: <strong>{currency(summary.kpis.ticket_medio)}</strong></li>
            <li>Taxa inadimplência: <strong>{percent(summary.kpis.taxa_inadimplencia)}</strong></li>
            <li>Taxa retenção: <strong>{percent(summary.kpis.taxa_retencao)}</strong></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
