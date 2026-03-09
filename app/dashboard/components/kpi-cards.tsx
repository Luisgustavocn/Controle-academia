"use client";

import { useEffect, useState } from "react";

type Kpis = {
  alunosAtivos: number;
  alunosInadimplentes: number;
  receitaMes: number;
  despesaMes: number;
  saldoMes: number;
  novasMatriculasMes: number;
  cancelamentosMes: number;
  frequenciaTotalMes: number;
  ticketMedio: number;
  taxaInadimplencia: number;
};

export function KpiCards() {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setKpis(d.kpis));
  }, []);

  if (!kpis) return <div className="card p-4">Carregando KPIs...</div>;

  const items = [
    ["Alunos Ativos", kpis.alunosAtivos],
    ["Inadimplentes", kpis.alunosInadimplentes],
    ["Receita Mes", `R$ ${kpis.receitaMes.toFixed(2)}`],
    ["Despesa Mes", `R$ ${kpis.despesaMes.toFixed(2)}`],
    ["Saldo Mes", `R$ ${kpis.saldoMes.toFixed(2)}`],
    ["Ticket Medio", `R$ ${kpis.ticketMedio.toFixed(2)}`],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <article key={String(label)} className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
        </article>
      ))}
    </div>
  );
}
