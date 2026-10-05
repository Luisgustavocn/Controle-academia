import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

type ProdutoResumo = {
  produto: string;
  quantidade: number;
  faturamento: number;
};

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.operational");
  if (auth instanceof Response) return auth;

  const competenciaParam = request.nextUrl.searchParams.get("competencia");
  if (competenciaParam && !/^\d{4}-\d{2}$/.test(competenciaParam)) {
    return fail("competencia invalida. Use yyyy-mm", 400);
  }

  const competencia = competenciaParam || currentCompetencia();
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const items = await prisma.pedidoProduto.findMany({
    where: {
      dataPedido: {
        gte: start,
        lt: end
      }
    },
    include: {
      aluno: {
        select: {
          nomeCompleto: true
        }
      },
      itens: {
        include: {
          produto: {
            select: {
              nome: true
            }
          }
        }
      }
    },
    orderBy: { dataPedido: "desc" }
  });

  const topProdutosMap = new Map<string, ProdutoResumo>();
  for (const pedido of items) {
    for (const item of pedido.itens) {
      const produto = item.produto?.nome || item.descricaoManual || item.modelo || "Item manual";
      const current = topProdutosMap.get(produto) ?? {
        produto,
        quantidade: 0,
        faturamento: 0
      };

      current.quantidade += Number(item.quantidade);
      current.faturamento += Number(item.valorTotal);
      topProdutosMap.set(produto, current);
    }
  }

  const topProdutos = Array.from(topProdutosMap.values())
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 10);

  return ok({
    competencia,
    totalPedidos: items.length,
    totalFaturado: items.reduce((acc, item) => acc + Number(item.valorTotal), 0),
    totalRecebido: items.reduce((acc, item) => acc + Number(item.pago), 0),
    totalEmAberto: items.reduce((acc, item) => acc + (Number(item.valorTotal) - Number(item.pago)), 0),
    items,
    topProdutos
  });
}
