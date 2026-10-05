import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.financial");
  if (auth instanceof Response) return auth;

  const competenciaParam = request.nextUrl.searchParams.get("competencia");
  if (competenciaParam && !/^\d{4}-\d{2}$/.test(competenciaParam)) {
    return fail("competencia invalida. Use yyyy-mm", 400);
  }

  const competencia = competenciaParam || currentCompetencia();

  const items = await prisma.mensalidade.findMany({
    where: { competencia },
    include: {
      aluno: {
        include: {
          modalidade: {
            select: { nome: true }
          }
        }
      }
    },
    orderBy: [{ vencimento: "asc" }, { aluno: { nomeCompleto: "asc" } }]
  });

  return ok({ competencia, items });
}
