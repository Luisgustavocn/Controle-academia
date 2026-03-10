import { MensalidadeStatus, Prisma, TipoMovimentacao } from "@prisma/client";
import { toCompetencia } from "@/lib/competencia";
import { prisma } from "@/lib/prisma";

const AUTO_MENSALIDADE_PREFIX = "auto_mensalidade_";
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
  return id.startsWith(AUTO_MENSALIDADE_PREFIX) || id.startsWith(AUTO_PEDIDO_PREFIX);
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
      tipo: true
    }
  });

  if (existing) {
    if (existing.tipo && existing.tipo !== TipoMovimentacao.ENTRADA) {
      return undefined;
    }

    await prisma.categoriaFinanceira.update({
      where: { id: existing.id },
      data: {
        tipo: TipoMovimentacao.ENTRADA,
        ativa: true
      }
    });
    return existing.id;
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

  const validAutoIds = new Set<string>();

  for (const mensalidade of mensalidades) {
    if (!mensalidade.dataPagamento) continue;
    const id = autoMensalidadeId(mensalidade.id);
    validAutoIds.add(id);
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
        observacao: "Lançamento automático (mensalidade)"
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
    validAutoIds.add(id);
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
        observacao: "Lançamento automático (pedido)"
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

  const autoItems = await prisma.movimentacaoCaixa.findMany({
    where: {
      OR: [
        { id: { startsWith: AUTO_MENSALIDADE_PREFIX } },
        { id: { startsWith: AUTO_PEDIDO_PREFIX } }
      ]
    },
    select: { id: true }
  });

  const staleIds = autoItems.map((item) => item.id).filter((id) => !validAutoIds.has(id));
  if (staleIds.length > 0) {
    await prisma.movimentacaoCaixa.deleteMany({
      where: {
        id: {
          in: staleIds
        }
      }
    });
  }
}

export function isAutoCaixaEntryId(id: string) {
  return isAutoId(id);
}
