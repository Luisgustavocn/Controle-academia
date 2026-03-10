"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CaixaPage() {
  return (
    <div className="space-y-4">
      <ModuleHeader title="Financeiro / Caixa" description="Livro-caixa mensal com entradas, saídas, saldo e fechamento automático." />
      <Card>
        <Button
          onClick={async () => {
            const competencia = prompt("Competência (yyyy-mm)", new Date().toISOString().slice(0, 7));
            if (!competencia) return;
            await fetch("/api/jobs/fechamento-caixa", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ competencia })
            });
            alert("Fechamento executado.");
          }}
        >
          Fechar caixa do mês
        </Button>
      </Card>

      <CrudModule
        endpoint="/api/caixa"
        title="Movimentações de caixa"
        listFields={["data", "tipo", "descricao", "valor", "competencia", "formaPagamento"]}
        fields={[
          { key: "data", label: "Data", type: "date", required: true },
          {
            key: "tipo",
            label: "Tipo",
            type: "select",
            required: true,
            options: [
              { label: "Entrada", value: "ENTRADA" },
              { label: "Saída", value: "SAIDA" }
            ]
          },
          { key: "categoriaId", label: "ID categoria" },
          { key: "descricao", label: "Descrição", required: true },
          { key: "valor", label: "Valor", type: "number", required: true },
          { key: "origemDestino", label: "Origem/Destino" },
          { key: "alunoId", label: "ID aluno" },
          { key: "formaPagamento", label: "Forma pagamento" },
          { key: "competencia", label: "Competência (yyyy-mm)", required: true },
          { key: "observacao", label: "Observação" }
        ]}
      />
    </div>
  );
}
