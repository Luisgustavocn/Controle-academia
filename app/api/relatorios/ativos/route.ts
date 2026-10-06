import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { academyToday } from "@/lib/attendance-date";
import { studentActiveOnDateWhere } from "@/lib/services/enrollment-periods";

export async function GET(request: NextRequest) {
  const auth = requireCapability(request, "reports.operational");
  if (auth instanceof Response) return auth;

  const alunos = await prisma.aluno.findMany({
    where: studentActiveOnDateWhere(academyToday()),
    include: { modalidade: true },
    orderBy: { nomeCompleto: "asc" }
  });

  return ok({ items: alunos });
}
