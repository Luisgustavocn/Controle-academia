import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const modalidadeId = req.nextUrl.searchParams.get("modalidadeId") || undefined;

  const alunos = await prisma.aluno.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { nomeCompleto: { contains: q, mode: "insensitive" } },
                { telefone: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        status ? { status: status as never } : {},
        modalidadeId ? { modalidadeId } : {},
      ],
    },
    include: { modalidade: true },
    orderBy: { nomeCompleto: "asc" },
  });

  return ok({ alunos });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.nomeCompleto || !body.modalidadeId) return fail("nomeCompleto e modalidadeId sao obrigatorios", 422);

  const aluno = await prisma.aluno.create({
    data: {
      nomeCompleto: body.nomeCompleto,
      telefone: body.telefone || null,
      modalidadeId: body.modalidadeId,
      vencimentoDia: Number(body.vencimentoDia || 10),
      status: body.status || "ATIVO",
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : new Date(),
      dataSaida: body.dataSaida ? new Date(body.dataSaida) : null,
      observacoes: body.observacoes || null,
    },
  });

  return ok({ aluno }, 201);
}
