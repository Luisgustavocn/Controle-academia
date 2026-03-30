import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

type Grouped = {
  categoria: string;
  quantidade: number;
  valorPrevisto: number;
  valorPago: number;
  pendentes: number;
};

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const competenciaParam = request.nextUrl.searchParams.get("competencia");
  if (competenciaParam && !/^\d{4}-\d{2}$/.test(competenciaParam)) {
    return fail("competencia invalida. Use yyyy-mm", 400);
  }

  const competencia = competenciaParam || currentCompetencia();

  const despesas = await prisma.despesaAcademia.findMany({
    where: { competencia },
    include: {
      categoria: {
        select: { nome: true }
      }
    },
    orderBy: { dataVencimento: "asc" }
  });

  const groupedMap = new Map<string, Grouped>();
  for (const item of despesas) {
    const categoria = item.categoria?.nome?.trim() || "Sem categoria";
    const current = groupedMap.get(categoria) ?? {
      categoria,
      quantidade: 0,
      valorPrevisto: 0,
      valorPago: 0,
      pendentes: 0
    };

    current.quantidade += 1;
    current.valorPrevisto += Number(item.valorPrevisto);
    current.valorPago += Number(item.valorPago);
    if (item.status !== "PAGO") {
      current.pendentes += 1;
    }

    groupedMap.set(categoria, current);
  }

  const items = Array.from(groupedMap.values()).sort((a, b) => b.valorPrevisto - a.valorPrevisto);

  return ok({
    competencia,
    totalPrevisto: despesas.reduce((acc, item) => acc + Number(item.valorPrevisto), 0),
    totalPago: despesas.reduce((acc, item) => acc + Number(item.valorPago), 0),
    items
  });
}
