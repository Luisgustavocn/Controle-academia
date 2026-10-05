"use client";

import { Users2 } from "lucide-react";
import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function AlunosPage() {
  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Alunos"
        description="Cadastro, status, plano, vencimento, histórico e filtros de inadimplência."
        icon={Users2}
        badges={["Cadastro completo", "Controle de status", "Busca rápida"]}
        stats={[
          { label: "Fluxo", value: "Entrada e saída" },
          { label: "Foco", value: "Inadimplência" }
        ]}
      />
      <CrudModule
        endpoint="/api/alunos"
        title="Cadastro de alunos"
        createLabel="Novo aluno"
        searchPlaceholder="Buscar por nome ou telefone"
        listFields={[
          { key: "nomeCompleto", label: "Nome" },
          { key: "telefone", label: "Telefone" },
          { key: "status", label: "Status" },
          { key: "modalidadeNome", label: "Modalidade" },
          { key: "vencimentoDia", label: "Vencimento" },
          { key: "inadimplente", label: "Inadimplente" },
          { key: "mensalidadeStatus", label: "Mensalidade" }
        ]}
        fields={[
          { key: "nomeCompleto", label: "Nome completo", required: true },
          { key: "telefone", label: "Telefone", required: true },
          { key: "modalidadeId", label: "Modalidade" },
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
          { key: "observacoes", label: "Observações", type: "textarea" },
          { key: "mensalidadeValor", label: "Valor mensalidade exclusivo (opcional)", type: "number" }
        ]}
        defaultValues={{ status: "ATIVO" }}
        createCapability="students.create"
        updateCapability="students.update"
        deleteCapability="students.status"
      />

      <CrudModule
        endpoint="/api/modalidades"
        title="Modalidades disponíveis"
        createLabel="Nova modalidade"
        searchPlaceholder="Buscar modalidade"
        listFields={[
          { key: "nome", label: "Modalidade" },
          { key: "valorPadrao", label: "Valor mensal" },
          { key: "ativa", label: "Ativa" }
        ]}
        fields={[
          { key: "nome", label: "Nome da modalidade", required: true },
          { key: "valorPadrao", label: "Valor mensal padrão", type: "number", required: true },
          {
            key: "ativa",
            label: "Ativa",
            type: "select",
            options: [
              { label: "Sim", value: "true" },
              { label: "Não", value: "false" }
            ]
          }
        ]}
        defaultValues={{ ativa: "true" }}
        createCapability="students.update"
        updateCapability="students.update"
        deleteCapability="students.update"
      />
    </div>
  );
}
