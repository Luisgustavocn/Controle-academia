"use client";

import { Building2 } from "lucide-react";
import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function DespesasAcademiaPage() {
  return (
    <div>
      <ModuleHeader
        title="Despesas da Academia"
        description="Contas fixas e variáveis com foco no valor pago e status de quitação."
        icon={Building2}
        badges={["Separado do caixa", "Valor pago", "Acompanhamento mensal"]}
        stats={[
          { label: "Tipo", value: "Fixas e variáveis" },
          { label: "Saúde", value: "Pendências" }
        ]}
      />
      <CrudModule
        endpoint="/api/despesas-academia"
        title="Despesas da academia"
        createLabel="Nova despesa"
        listFields={[
          { key: "descricao", label: "Descrição" },
          { key: "valorPago", label: "Pago" },
          { key: "status", label: "Status" },
          { key: "dataVencimento", label: "Vencimento" }
        ]}
        fields={[
          { key: "dataVencimento", label: "Vencimento", type: "date", required: true },
          { key: "descricao", label: "Descrição", required: true },
          { key: "categoriaId", label: "ID categoria" },
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
          { key: "observacao", label: "Observação", type: "textarea" }
        ]}
        createCapability="finance.expenses.manage"
        updateCapability="finance.expenses.manage"
        deleteCapability="finance.expenses.manage"
      />
    </div>
  );
}
