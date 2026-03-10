"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MensalidadesPage() {
  return (
    <div className="space-y-4">
      <ModuleHeader title="Mensalidades" description="Cobrança por competência com pagamentos, histórico anual e inadimplência." />

      <Card className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const competencia = prompt("Competência (yyyy-mm)", new Date().toISOString().slice(0, 7));
            if (!competencia) return;
            await fetch("/api/jobs/gerar-mensalidades", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ competencia })
            });
            window.location.reload();
          }}
        >
          Gerar mensalidades do mês
        </Button>
      </Card>

      <CrudModule
        endpoint="/api/mensalidades"
        title="Controle de mensalidades"
        searchPlaceholder="Buscar por aluno"
        listFields={["competencia", "nome", "telefone", "modalidade", "valor", "vencimento", "status", "totalPagoAno"]}
        fields={[
          { key: "alunoId", label: "ID aluno", required: true },
          { key: "competencia", label: "Competência (yyyy-mm)", required: true },
          { key: "valor", label: "Valor", type: "number", required: true },
          { key: "vencimento", label: "Vencimento", type: "date", required: true },
          { key: "dataPagamento", label: "Data pagamento", type: "date" },
          { key: "formaPagamento", label: "Forma pagamento" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { label: "Pendente", value: "PENDENTE" },
              { label: "Pago", value: "PAGO" },
              { label: "Atrasado", value: "ATRASADO" },
              { label: "Isento", value: "ISENTO" },
              { label: "Parcial", value: "PARCIAL" }
            ]
          },
          { key: "observacao", label: "Observação" }
        ]}
      />
    </div>
  );
}
