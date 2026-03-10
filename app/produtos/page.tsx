"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function ProdutosPage() {
  return (
    <div>
      <ModuleHeader title="Produtos" description="Cadastro de roupas/suplementos, preço e estoque simples." />
      <CrudModule
        endpoint="/api/produtos"
        title="Catálogo de produtos"
        listFields={["nome", "categoria", "tamanho", "cor", "preco", "estoque", "ativo"]}
        fields={[
          { key: "nome", label: "Nome", required: true },
          { key: "categoria", label: "Categoria", required: true },
          { key: "tamanho", label: "Tamanho" },
          { key: "cor", label: "Cor" },
          { key: "preco", label: "Preço", type: "number", required: true },
          { key: "estoque", label: "Estoque", type: "number" },
          {
            key: "ativo",
            label: "Ativo",
            type: "select",
            options: [
              { label: "Sim", value: "true" },
              { label: "Não", value: "false" }
            ]
          }
        ]}
      />
    </div>
  );
}
