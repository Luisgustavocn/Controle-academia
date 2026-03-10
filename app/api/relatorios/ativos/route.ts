import { AlunoStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const alunos = await prisma.aluno.findMany({
    where: { status: AlunoStatus.ATIVO },
    include: { modalidade: true },
    orderBy: { nomeCompleto: "asc" }
  });

  return ok({ items: alunos });
}
