"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function DespesasAcademiaPage() {
  return (
    <div>
      <ModuleHeader title="Despesas da Academia" description="Contas fixas e variáveis com previsto, pago e pendente por competência." />
      <CrudModule
        endpoint="/api/despesas-academia"
        title="Despesas da academia"
        listFields={["competencia", "descricao", "valorPrevisto", "valorPago", "status", "dataVencimento"]}
        fields={[
          { key: "dataVencimento", label: "Vencimento", type: "date", required: true },
          { key: "competencia", label: "Competência (yyyy-mm)", required: true },
          { key: "descricao", label: "Descrição", required: true },
          { key: "categoriaId", label: "ID categoria" },
          { key: "valorPrevisto", label: "Valor previsto", type: "number", required: true },
          { key: "valorPago", label: "Valor pago", type: "number" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { label: "Pendente", value: "PENDENTE" },
              { label: "Pago", value: "PAGO" },
              { label: "Parcial", value: "PARCIAL" }
            ]
          },
          { key: "dataPagamento", label: "Data pagamento", type: "date" },
          { key: "observacao", label: "Observação" }
        ]}
      />
    </div>
  );
}
