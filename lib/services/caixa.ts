import { MensalidadeStatus, MovimentacaoCaixaOrigem, Prisma, TipoMovimentacao } from "@prisma/client";
import { toCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";

const AUTO_MENSALIDADE_PREFIX = "auto_mensalidade_";
export const AUTO_PAGAMENTO_PREFIX = "auto_pagamento_";
const AUTO_PEDIDO_PREFIX = "auto_pedido_";
const AUTO_SYNC_MIN_INTERVAL_MS = 15_000;

let lastAutoSyncAt = 0;

function autoMensalidadeId(id: string) {
  return `${AUTO_MENSALIDADE_PREFIX}${id}`;
}

function autoPedidoId(id: string) {
  return `${AUTO_PEDIDO_PREFIX}${id}`;
}

function isAutoId(id: string) {
  return id.startsWith(AUTO_MENSALIDADE_PREFIX) || id.startsWith(AUTO_PAGAMENTO_PREFIX) || id.startsWith(AUTO_PEDIDO_PREFIX);
}

async function ensureEntradaCategoria(nome: string) {
  const existing = await prisma.categoriaFinanceira.findFirst({
    where: {
      nome: {
        equals: nome,
        mode: Prisma.QueryMode.insensitive
      }
    },
    select: {
      id: true,
      tipo: true,
      ativa: true
    }
  });

  if (existing) {
    if (existing.tipo && existing.tipo !== TipoMovimentacao.ENTRADA) {
      return undefined;
    }

    return existing.ativa === false ? undefined : existing.id;
  }

  try {
    const created = await prisma.categoriaFinanceira.create({
      data: {
        nome,
        tipo: TipoMovimentacao.ENTRADA,
        ativa: true
      },
      select: {
        id: true
      }
    });
    return created.id;
  } catch {
    return undefined;
  }
}

export async function syncAutomaticEntriesInCaixa(force = false) {
  const now = Date.now();
  if (!force && now - lastAutoSyncAt < AUTO_SYNC_MIN_INTERVAL_MS) {
    return;
  }
  lastAutoSyncAt = now;

  const [mensalidades, pedidos] = await Promise.all([
    prisma.mensalidade.findMany({
      where: {
        status: {
          in: [MensalidadeStatus.PAGO, MensalidadeStatus.PARCIAL]
        },
        dataPagamento: {
          not: null
        },
        valor: {
          gt: 0
        }
      },
      include: {
        pagamentos: { where: { status: "CONFIRMADO" }, select: { id: true }, take: 1 },
        aluno: {
          select: {
            id: true,
            nomeCompleto: true
          }
        }
      }
    }),
    prisma.pedidoProduto.findMany({
      where: {
        pago: {
          gt: 0
        }
      },
      include: {
        aluno: {
          select: {
            id: true,
            nomeCompleto: true
          }
        }
      }
    })
  ]);

  const [categoriaMensalidadesId, categoriaPedidosId] = await Promise.all([
    ensureEntradaCategoria("Mensalidades"),
    ensureEntradaCategoria("Vendas de produtos")
  ]);

  for (const mensalidade of mensalidades) {
    if (!mensalidade.dataPagamento) continue;
    // Novas baixas possuem Pagamento explicito e Caixa proprio por pagamento.
    // A sincronizacao nominal permanece apenas para o legado sem Pagamento.
    if (mensalidade.pagamentos.length > 0) continue;
    const id = autoMensalidadeId(mensalidade.id);
    const nomeAluno = mensalidade.aluno?.nomeCompleto ?? "Aluno";
    const data = mensalidade.dataPagamento;

    await prisma.movimentacaoCaixa.upsert({
      where: { id },
      create: {
        id,
        data,
        tipo: TipoMovimentacao.ENTRADA,
        categoriaId: categoriaMensalidadesId ?? null,
        descricao: `Mensalidade ${mensalidade.competencia} - ${nomeAluno}`,
        valor: Number(mensalidade.valor),
        origemDestino: nomeAluno,
        alunoId: mensalidade.alunoId,
        formaPagamento: mensalidade.formaPagamento ?? null,
        competencia: toCompetencia(data),
        observacao: "Lançamento automático (mensalidade)",
        origem: MovimentacaoCaixaOrigem.PAGAMENTO_MENSALIDADE,
        mensalidadeId: mensalidade.id
      },
      update: {
        data,
        tipo: TipoMovimentacao.ENTRADA,
        categoriaId: categoriaMensalidadesId ?? null,
        descricao: `Mensalidade ${mensalidade.competencia} - ${nomeAluno}`,
        valor: Number(mensalidade.valor),
        origemDestino: nomeAluno,
        alunoId: mensalidade.alunoId,
        formaPagamento: mensalidade.formaPagamento ?? null,
        competencia: toCompetencia(data),
        observacao: "Lançamento automático (mensalidade)"
      }
    });
  }

  for (const pedido of pedidos) {
    const id = autoPedidoId(pedido.id);
    const nomeAluno = pedido.aluno?.nomeCompleto ?? pedido.clienteNome ?? "Cliente";
    const data = pedido.dataPedido;

    await prisma.movimentacaoCaixa.upsert({
      where: { id },
      create: {
        id,
        data,
        tipo: TipoMovimentacao.ENTRADA,
        categoriaId: categoriaPedidosId ?? null,
        descricao: `Pedido de produto - ${nomeAluno}`,
        valor: Number(pedido.pago),
        origemDestino: nomeAluno,
        alunoId: pedido.alunoId,
        formaPagamento: null,
        competencia: toCompetencia(data),
        observacao: "Lançamento automático (pedido)",
        origem: MovimentacaoCaixaOrigem.PEDIDO,
        pedidoProdutoId: pedido.id
      },
      update: {
        data,
        tipo: TipoMovimentacao.ENTRADA,
        categoriaId: categoriaPedidosId ?? null,
        descricao: `Pedido de produto - ${nomeAluno}`,
        valor: Number(pedido.pago),
        origemDestino: nomeAluno,
        alunoId: pedido.alunoId,
        formaPagamento: null,
        competencia: toCompetencia(data),
        observacao: "Lançamento automático (pedido)"
      }
    });
  }

  // Entradas automáticas históricas nunca são apagadas durante uma leitura/sincronização.
}

export function isAutoCaixaEntryId(id: string) {
  return isAutoId(id);
}
