"use client";

import { Package } from "lucide-react";
import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function ProdutosPage() {
  return (
    <div>
      <ModuleHeader
        title="Produtos"
        description="Cadastro de roupas/suplementos, preço e estoque simples."
        icon={Package}
        badges={["Catálogo interno", "Controle de estoque", "Preço por item"]}
        stats={[
          { label: "Operação", value: "Vendas internas" },
          { label: "Controle", value: "Ativo/Inativo" }
        ]}
      />
      <CrudModule
        endpoint="/api/produtos"
        title="Catálogo de produtos"
        createLabel="Novo produto"
        listFields={[
          { key: "nome", label: "Produto" },
          { key: "categoria", label: "Categoria" },
          { key: "tamanho", label: "Tamanho" },
          { key: "cor", label: "Cor" },
          { key: "preco", label: "Preço" },
          { key: "estoque", label: "Estoque" },
          { key: "ativo", label: "Ativo" }
        ]}
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
        createCapability="products.manage"
        updateCapability="products.manage"
        deleteCapability="products.manage"
      />
    </div>
  );
}
