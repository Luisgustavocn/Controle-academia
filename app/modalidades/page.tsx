"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { PageHeader } from "@/components/ui/page-header";

export default function ModalidadesPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Modalidades"
        description="Gerencie as modalidades e seus valores mensais padrão."
        breadcrumbs={[{ label: "Início", href: "/dashboard" }, { label: "Modalidades" }]}
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
          { key: "valorPadrao", label: "Valor mensal padrão", type: "number" },
          { key: "ativa", label: "Ativa", type: "select", options: [{ label: "Sim", value: "true" }, { label: "Não", value: "false" }] }
        ]}
        defaultValues={{ ativa: "true" }}
        createCapability="students.update"
        updateCapability="students.update"
        deleteCapability="students.update"
      />
    </div>
  );
}
