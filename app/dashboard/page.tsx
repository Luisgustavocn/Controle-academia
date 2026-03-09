import { KpiCards } from "@/app/dashboard/components/kpi-cards";

export default function DashboardPage() {
  return (
    <section className="space-y-4">
      <KpiCards />
      <article className="card p-4">
        <h2 className="text-lg font-semibold">Resumo Operacional</h2>
        <p className="text-sm text-slate-600 mt-1">
          O dashboard consolida financeiro, presenca, matriculas, cancelamentos e inadimplencia automaticamente.
        </p>
      </article>
    </section>
  );
}
