import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia } from "@/lib/competencia";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.PERSONAL);
  if (auth instanceof Response) return auth;

  const competencia = request.nextUrl.searchParams.get("competencia") || currentCompetencia();
  const start = new Date(`${competencia}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const presencas = await prisma.presenca.findMany({
    where: {
      data: {
        gte: start,
        lt: end
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
