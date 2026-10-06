import { NextRequest } from "next/server";
import { CivilDateValidationError, civilMonthRange, prismaDateToCivil } from "@/lib/attendance-date";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enrollmentCoversCompetenceWhere } from "@/lib/services/enrollment-periods";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "attendance.read");
  if (auth instanceof Response) return auth;

  const competencia = request.nextUrl.searchParams.get("competencia") ?? "";
  if (!competencia) {
    return fail("competencia é obrigatória (yyyy-mm)", 400);
  }

  let period;
  try {
    period = civilMonthRange(competencia);
  } catch (error) {
    if (error instanceof CivilDateValidationError) return fail(error.message, 400);
    throw error;
  }

  const alunos = await prisma.aluno.findMany({
    where: { periodosMatricula: { some: enrollmentCoversCompetenceWhere(competencia) } },
    select: {
      id: true,
      nomeCompleto: true,
      status: true,
      modalidade: { select: { nome: true } }
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

  return ok({
    items: {
      alunos,
      presencas: presencas.map((presenca) => ({ ...presenca, data: prismaDateToCivil(presenca.data) }))
    }
  });
}
