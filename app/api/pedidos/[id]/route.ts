import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value: unknown, fallback = 1) {
  return Math.max(1, Math.trunc(toNumber(value, fallback)));
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function parseOptionalDate(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

async function loadAlunoOrFail(alunoId: string) {
  const aluno = await prisma.aluno.findUnique({
    where: { id: alunoId },
    select: { id: true, nomeCompleto: true }
  });

  if (!aluno) {
    return { ok: false as const, error: "Aluno não encontrado" };
  }

  return { ok: true as const, aluno };
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const existing = await prisma.pedidoProduto.findUnique({
    where: { id },
    include: {
      itens: {
        include: {
          produto: {
            select: {
              id: true,
              nome: true,
              categoria: true,
              tamanho: true,
              cor: true,
              preco: true,
              estoque: true,
              ativo: true
            }
          }
        }
      }
    }
  });

  if (!existing) {
    return fail("Pedido não encontrado", 404);
  }

  const nonEmptyKeys = Object.keys(body).filter((key) => body[key] !== undefined);
  const isOnlyPagoUpdate = nonEmptyKeys.length > 0 && nonEmptyKeys.every((key) => key === "pago");
  if (isOnlyPagoUpdate) {
    const valorTotal = Number(existing.valorTotal);
    const pago = Math.max(0, Math.min(toNumber(body.pago, Number(existing.pago)), valorTotal));
    const updated = await prisma.pedidoProduto.update({
      where: { id },
      data: { pago }
    });
    await syncAutomaticEntriesInCaixa(true);
    return ok({ item: updated });
  }

  const firstItem = existing.itens.find((item) => item.produtoId) ?? existing.itens[0] ?? null;
  const currentProdutoId = firstItem?.produtoId ?? null;
  const produtoIdFromBody = body.produtoId === undefined ? undefined : normalizeOptionalString(body.produtoId);
  const targetProdutoId = produtoIdFromBody === undefined ? currentProdutoId : produtoIdFromBody;
  const alunoIdFromBody = body.alunoId === undefined ? undefined : normalizeOptionalString(body.alunoId);
  const targetAlunoId = alunoIdFromBody === undefined ? existing.alunoId : alunoIdFromBody;

  if (!targetProdutoId) {
    return fail("Selecione um produto para o pedido", 400);
  }

  if (!targetAlunoId) {
    return fail("Selecione o aluno do pedido", 400);
  }

  const quantidade =
    body.quantidade === undefined ? existing.quantidade : toPositiveInt(body.quantidade, existing.quantidade);

  const dataPedidoInput = parseOptionalDate(body.dataPedido);
  if (dataPedidoInput === null) {
    return fail("Data do pedido inválida", 400);
  }

  const alunoResult = await loadAlunoOrFail(targetAlunoId);
  if (!alunoResult.ok) {
    return fail(alunoResult.error, 400);
  }
  const aluno = alunoResult.aluno;

  const paidRaw = body.pago === undefined ? Number(existing.pago) : Math.max(0, toNumber(body.pago, 0));

  let updated;
  try {
    updated = await prisma.$transaction(async (trx) => {
      for (const item of existing.itens) {
        if (!item.produtoId) continue;
        await trx.produto.update({
          where: { id: item.produtoId },
          data: {
            estoque: {
              increment: item.quantidade
            }
          }
        });
      }

      const produto = await trx.produto.findUnique({
        where: { id: targetProdutoId },
        select: {
          id: true,
          nome: true,
          categoria: true,
          tamanho: true,
          cor: true,
          preco: true,
          estoque: true,
          ativo: true
        }
      });

      if (!produto) {
        throw new Error("Produto não encontrado");
      }

      if (!produto.ativo) {
        throw new Error("Produto inativo. Escolha um produto ativo");
      }

      if (produto.estoque < quantidade) {
        throw new Error(`Estoque insuficiente. Disponível: ${produto.estoque}`);
      }

      const valorUnitario = Number(produto.preco);
      const valorTotal = quantidade * valorUnitario;
      const pago = Math.min(paidRaw, valorTotal);

      const pedido = await trx.pedidoProduto.update({
        where: { id },
        data: {
          clienteNome: aluno.nomeCompleto,
          alunoId: aluno.id,
          modelo: produto.nome,
          cor: produto.cor,
          tamanho: produto.tamanho,
          quantidade,
          valorUnitario,
          valorTotal,
          pago,
          dataPedido: dataPedidoInput ?? undefined,
          observacao: body.observacao === undefined ? undefined : normalizeOptionalString(body.observacao),
          itens: {
            deleteMany: {},
            create: [
              {
                produtoId: produto.id,
                descricaoManual: null,
                modelo: produto.nome,
                cor: produto.cor,
                tamanho: produto.tamanho,
                quantidade,
                valorUnitario,
                valorTotal
              }
            ]
          }
        },
        include: {
          itens: {
            include: {
              produto: {
                select: {
                  id: true,
                  nome: true,
                  categoria: true,
                  tamanho: true,
                  cor: true,
                  preco: true,
                  estoque: true,
                  ativo: true
                }
              }
            }
          }
        }
      });

      await trx.produto.update({
        where: { id: produto.id },
        data: {
          estoque: {
            decrement: quantidade
          }
        }
      });

      return pedido;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar pedido";
    return fail(message, 400);
  }

  await syncAutomaticEntriesInCaixa(true);

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  await context.params;
  return fail("Exclusão física de pedidos está bloqueada para proteger o histórico. Faça a correção pelo próprio pedido ou registre um ajuste.", 409);
}
