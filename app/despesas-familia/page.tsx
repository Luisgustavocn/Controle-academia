"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function DespesasFamiliaPage() {
  return (
    <div>
      <ModuleHeader title="Despesas da Família" description="Controle financeiro pessoal separado da academia e consolidável nos relatórios." />
      <CrudModule
        endpoint="/api/despesas-familia"
        title="Despesas da família"
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
