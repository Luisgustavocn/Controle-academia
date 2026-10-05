import { AlunoStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function parseCompetencia(competencia: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "attendance.read");
  if (auth instanceof Response) return auth;

  const competencia = request.nextUrl.searchParams.get("competencia") ?? "";
  if (!competencia) {
    return fail("competencia é obrigatória (yyyy-mm)", 400);
  }

  const period = parseCompetencia(competencia);
  if (!period) {
    return fail("competencia inválida. Use yyyy-mm", 400);
  }

  const alunos = await prisma.aluno.findMany({
    where: {
      status: {
        in: [AlunoStatus.ATIVO, AlunoStatus.TRANCADO]
      }
    },
    select: {
      id: true,
      nomeCompleto: true,
      status: true
    },
    orderBy: {
      nomeCompleto: "asc"
    }
  });

  const presencas = await prisma.presenca.findMany({
    where: {
      data: {
        gte: period.start,
        lt: period.end
      }
    },
    select: {
      id: true,
      alunoId: true,
      data: true,
      presente: true
    }
  });

  return ok({ items: { alunos, presencas } });
}

