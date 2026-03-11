"use client";

import { HandCoins } from "lucide-react";
import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function DespesasFamiliaPage() {
  return (
    <div>
      <ModuleHeader
        title="Despesas da Família"
        description="Controle financeiro pessoal separado da academia e consolidável nos relatórios."
        icon={HandCoins}
        badges={["Financeiro pessoal", "Separação de contas", "Consolidação opcional"]}
        stats={[
          { label: "Escopo", value: "Família" },
          { label: "Controle", value: "Previsto x pago" }
        ]}
      />
      <CrudModule
        endpoint="/api/despesas-familia"
        title="Despesas da família"
        createLabel="Nova despesa"
        listFields={[
          { key: "competencia", label: "Competência" },
          { key: "descricao", label: "Descrição" },
          { key: "valorPrevisto", label: "Previsto" },
          { key: "valorPago", label: "Pago" },
          { key: "status", label: "Status" },
          { key: "dataVencimento", label: "Vencimento" }
        ]}
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
          { key: "observacao", label: "Observação", type: "textarea" }
        ]}
      />
    </div>
  );
}
