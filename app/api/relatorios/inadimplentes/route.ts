import { MensalidadeStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const competencia = request.nextUrl.searchParams.get("competencia") || currentCompetencia();

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
