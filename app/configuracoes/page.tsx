"use client";

import { useState } from "react";
import { ModuleHeader } from "@/components/ui/module-header";
import { CrudModule } from "@/components/forms/crud-module";
import { Card } from "@/components/ui/card";

export default function ConfiguracoesPage() {
  const [importing, setImporting] = useState(false);

  async function importExcel(file: File) {
    setImporting(true);
    const form = new FormData();
    form.set("file", file);
    form.set("year", String(new Date().getFullYear()));

    const res = await fetch("/api/import/excel", {
      method: "POST",
      body: form
    });

    const data = await res.json();
    setImporting(false);

    if (!res.ok) {
      alert(data.error ?? "Falha na importação");
      return;
    }

    alert("Importação concluída. Verifique os módulos.");
  }

  return (
    <div className="space-y-4">
      <ModuleHeader title="Configurações" description="Usuários, perfis, parâmetros do sistema e importação da planilha antiga." />

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Importar planilha antiga</h2>
        <p className="mb-3 text-sm text-muted">Mapeamento automático: Musc, caixa, despesas, presença, personal e pedidos.</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importExcel(file);
            }
          }}
        />
        {importing ? <p className="mt-2 text-sm">Importando...</p> : null}
      </Card>

      <CrudModule
        endpoint="/api/users"
        title="Usuários e perfis"
        listFields={["name", "email", "role", "active", "createdAt"]}
        fields={[
          { key: "name", label: "Nome", required: true },
          { key: "email", label: "E-mail", required: true },
          { key: "password", label: "Senha", required: true },
          {
            key: "role",
            label: "Perfil",
            type: "select",
            options: [
              { label: "Administrador", value: "ADMIN" },
              { label: "Financeiro", value: "FINANCEIRO" },
              { label: "Recepção", value: "RECEPCAO" },
              { label: "Personal", value: "PERSONAL" }
            ]
          },
          {
            key: "active",
            label: "Ativo",
            type: "select",
            options: [
              { label: "Sim", value: "true" },
              { label: "Não", value: "false" }
            ]
          }
        ]}
        defaultValues={{ role: "RECEPCAO", active: "true" }}
      />

      <CrudModule
        endpoint="/api/configuracoes"
        title="Parâmetros do sistema"
        listFields={["chave", "valor", "descricao", "updatedAt"]}
        fields={[
          { key: "chave", label: "Chave", required: true },
          { key: "valor", label: "Valor", required: true },
          { key: "descricao", label: "Descrição" }
        ]}
      />
    </div>
  );
}
