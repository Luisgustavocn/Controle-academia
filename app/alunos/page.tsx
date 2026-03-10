"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function AlunosPage() {
  return (
    <div>
      <ModuleHeader title="Alunos" description="Cadastro, status, plano, vencimento, histórico e filtros de inadimplência." />
      <CrudModule
        endpoint="/api/alunos"
        title="Cadastro de alunos"
        searchPlaceholder="Buscar por nome ou telefone"
        listFields={["nomeCompleto", "telefone", "status", "modalidadeNome", "vencimentoDia", "inadimplente"]}
        fields={[
          { key: "nomeCompleto", label: "Nome completo", required: true },
          { key: "telefone", label: "Telefone", required: true },
          { key: "modalidadeId", label: "ID modalidade" },
          { key: "vencimentoDia", label: "Vencimento (dia)", type: "number", required: true },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { label: "Ativo", value: "ATIVO" },
              { label: "Inativo", value: "INATIVO" },
              { label: "Cancelado", value: "CANCELADO" },
              { label: "Trancado", value: "TRANCADO" }
            ]
          },
          { key: "dataInicio", label: "Data início", type: "date", required: true },
          { key: "dataSaidaCancelamento", label: "Data saída", type: "date" },
          { key: "observacoes", label: "Observações" }
        ]}
        defaultValues={{ status: "ATIVO" }}
      />
    </div>
  );
}
