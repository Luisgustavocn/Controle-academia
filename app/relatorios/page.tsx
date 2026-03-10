"use client";

import { useState } from "react";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RelatoriosPage() {
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [output, setOutput] = useState("");

  async function run(url: string) {
    const res = await fetch(url);
    const data = await res.json();
    setOutput(JSON.stringify(data, null, 2));
  }

  return (
    <div className="space-y-4">
      <ModuleHeader title="Relatórios" description="Geração de relatórios de alunos, pagamentos, caixa, despesas e frequência." />

      <Card>
        <label className="mb-3 block text-sm font-semibold">
          Competência
          <Input value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("/api/relatorios/ativos")}>Alunos ativos</Button>
          <Button onClick={() => run(`/api/relatorios/inadimplentes?competencia=${competencia}`)}>Inadimplentes</Button>
          <Button onClick={() => run(`/api/relatorios/caixa-mensal?competencia=${competencia}`)}>Caixa mensal</Button>
          <Button onClick={() => run(`/api/relatorios/frequencia?competencia=${competencia}`)}>Frequência mensal</Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Saída do relatório</h2>
        <pre className="max-h-[520px] overflow-auto text-xs">{output || "Selecione um relatório."}</pre>
      </Card>
    </div>
  );
}
