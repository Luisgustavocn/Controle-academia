"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function PedidosPage() {
  return (
    <div>
      <ModuleHeader title="Pedidos" description="Pedidos internos de roupas/produtos com status de pagamento e produção." />
      <CrudModule
        endpoint="/api/pedidos"
        title="Pedidos de produtos"
        listFields={["clienteNome", "modelo", "cor", "tamanho", "quantidade", "valorUnitario", "valorTotal", "pago", "dataPedido"]}
        fields={[
          { key: "clienteNome", label: "Cliente", required: true },
          { key: "alunoId", label: "ID aluno" },
          { key: "modelo", label: "Modelo" },
          { key: "cor", label: "Cor" },
          { key: "tamanho", label: "Tamanho" },
          { key: "quantidade", label: "Quantidade", type: "number", required: true },
          { key: "valorUnitario", label: "Valor unitário", type: "number", required: true },
          { key: "valorTotal", label: "Valor total", type: "number", required: true },
          { key: "pago", label: "Valor pago", type: "number" },
          { key: "dataPedido", label: "Data pedido", type: "date" },
          { key: "observacao", label: "Observação" }
        ]}
      />
    </div>
  );
}
