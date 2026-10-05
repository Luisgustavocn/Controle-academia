import {} from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { academyToday, CivilDateValidationError, civilMonthRange } from "@/lib/attendance-date";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.operational");
  if (auth instanceof Response) return auth;

  const competenciaParam = request.nextUrl.searchParams.get("competencia");
  if (competenciaParam && !/^\d{4}-\d{2}$/.test(competenciaParam)) {
    return fail("competencia inválida. Use yyyy-mm", 400);
  }
  const competencia = competenciaParam || academyToday().slice(0, 7);
  let range;
  try {
    range = civilMonthRange(competencia);
  } catch (error) {
    if (error instanceof CivilDateValidationError) return fail(error.message, 400);
    throw error;
  }

  const presencas = await prisma.presenca.findMany({
    where: {
      data: {
        gte: range.start,
        lt: range.end
      },
      presente: true
    },
    include: {
      aluno: {
        select: {
          nomeCompleto: true
        }
      }
    }
  });

  const rankingMap = new Map<string, { nome: string; total: number }>();
  for (const p of presencas) {
    const key = p.alunoId;
    const current = rankingMap.get(key) ?? { nome: p.aluno.nomeCompleto, total: 0 };
    current.total += 1;
    rankingMap.set(key, current);
  }

  const ranking = Array.from(rankingMap.values()).sort((a, b) => b.total - a.total);

  return ok({
    competencia,
    totalPresencasMes: presencas.length,
    ranking,
    baixaFrequencia: ranking.filter((item) => item.total < 4)
  });
}
