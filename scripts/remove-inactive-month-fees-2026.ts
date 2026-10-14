import { MensalidadeStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const EXPECTED_MAXIMUM = 394;

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
      -- Prisma models this column as timestamp without time zone. Keep the
      -- canonical database value explicit instead of coercing a JS Date.
      AND m."createdAt" = timestamp '2026-10-06 18:10:44.354'
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
    console.log(JSON.stringify({ mode: "dry-run", candidates: preview.length, protected: preview.length, plannedDeletes: 0, totalValue: previewValue, classification: "PROTEGIDO_DADO_EXISTENTE" }));
    return;
  }
  throw new Error("Apply desabilitado permanentemente: rotina histórica não pode excluir Mensalidade existente");
}

main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
