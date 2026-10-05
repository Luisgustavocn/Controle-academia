import { MensalidadeStatus } from "@prisma/client";
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
    return fail("competencia inválida. Use yyyy-mm", 400);
  }
  const competencia = competenciaParam || currentCompetencia();

  const items = await prisma.mensalidade.findMany({
    where: {
      competencia,
      status: {
        in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO]
      }
    },
    include: {
      aluno: {
        select: {
          nomeCompleto: true,
          telefone: true,
          status: true
        }
      }
    }
  });

  return ok({ items });
}
