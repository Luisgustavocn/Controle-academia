import { MensalidadeStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const EXPECTED_MAXIMUM = 394;
const AUTOMATIC_BATCH_CREATED_AT = new Date("2026-10-06T18:10:44.354Z");

type Candidate = {
  id: string;
  competencia: string;
  valor: Prisma.Decimal;
  status: MensalidadeStatus;
};

async function eligible(client: Prisma.TransactionClient | typeof prisma): Promise<Candidate[]> {
  return client.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT m.id, m.competencia, m.valor, m.status
    FROM "Mensalidade" m
    WHERE m.competencia BETWEEN '2026-01' AND '2026-10'
      AND m.status IN ('ATRASADO'::"MensalidadeStatus", 'PENDENTE'::"MensalidadeStatus")
      AND m."createdAt" = ${AUTOMATIC_BATCH_CREATED_AT}
      AND m."dataPagamento" IS NULL
      AND m."formaPagamento" IS NULL
      AND m.observacao IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Presenca" p
        WHERE p."alunoId" = m."alunoId"
          AND p.presente = true
          AND to_char(p.data, 'YYYY-MM') = m.competencia
      )
      AND NOT EXISTS (
        SELECT 1 FROM "Pagamento" pg
        WHERE pg."mensalidadeId" = m.id
          AND pg.status = 'CONFIRMADO'::"PagamentoStatus"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "MovimentacaoCaixa" c
        WHERE c."alunoId" = m."alunoId"
          AND c.competencia = m.competencia
          AND c.tipo = 'ENTRADA'::"TipoMovimentacao"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "LogAuditoria" l
        WHERE l."entidadeId" = m.id
          AND l.entidade = 'Mensalidade'
          AND l.acao IN ('CREATE', 'UPSERT')
      )
    ORDER BY m.id
  `);
}

async function main() {
  const preview = await eligible(prisma);
  const previewValue = preview.reduce((sum, item) => sum + Number(item.valor), 0);
  if (preview.length > EXPECTED_MAXIMUM) {
    throw new Error(`Bloqueado: ${preview.length} candidatos excedem o máximo aprovado de ${EXPECTED_MAXIMUM}`);
  }
  if (!APPLY) {
    console.log(JSON.stringify({ mode: "dry-run", candidates: preview.length, totalValue: previewValue }));
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const candidates = await eligible(tx);
    if (candidates.length > EXPECTED_MAXIMUM) throw new Error("Conjunto elegível aumentou durante a revalidação");
    const ids = candidates.map((item) => item.id);
    const totalValue = candidates.reduce((sum, item) => sum + Number(item.valor), 0);
    const competences = Array.from(new Set(candidates.map((item) => item.competencia))).sort();
    const deleted = ids.length
      ? await tx.mensalidade.deleteMany({ where: { id: { in: ids } } })
      : { count: 0 };
    if (deleted.count !== ids.length) throw new Error("A exclusão não correspondeu aos IDs revalidados");
    await tx.logAuditoria.create({
      data: {
        modulo: "mensalidades",
        entidade: "Mensalidade",
        entidadeId: "batch:inactive-month-fees-2026",
        acao: "REMOVE_INACTIVE_MONTH_FEES_2026",
        antes: { quantidade: ids.length, valorTotal: totalValue, competencias: competences },
        depois: { quantidadeRestante: 0 },
      }
    });
    return { removed: deleted.count, totalValue, competences };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(JSON.stringify({ mode: "apply", ...result }));
}

main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
