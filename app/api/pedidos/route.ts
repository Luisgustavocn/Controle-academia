import { Prisma, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
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

function parseDataPedido(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return new Date();
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

type ProdutoLookupResult =
  | { ok: true; produto: { id: string; nome: string; categoria: string; tamanho: string | null; cor: string | null; preco: Prisma.Decimal; estoque: number; ativo: boolean } }
  | { ok: false; error: string };

type AlunoLookupResult =
  | { ok: true; aluno: { id: string; nomeCompleto: string } }
  | { ok: false; error: string };

async function loadProdutoOrFail(produtoId: string): Promise<ProdutoLookupResult> {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
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
    return { ok: false, error: "Produto não encontrado" };
  }

  if (!produto.ativo) {
    return { ok: false, error: "Produto inativo. Escolha um produto ativo" };
  }

  return { ok: true, produto };
}

async function loadAlunoOrFail(alunoId: string): Promise<AlunoLookupResult> {
  const aluno = await prisma.aluno.findUnique({
    where: { id: alunoId },
    select: { id: true, nomeCompleto: true }
  });

  if (!aluno) {
    return { ok: false, error: "Aluno não encontrado" };
  }

  return { ok: true, aluno };
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const q = request.nextUrl.searchParams.get("q") ?? "";

  const items = await prisma.pedidoProduto.findMany({
    where: q
      ? {
          OR: [
            { clienteNome: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { modelo: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { cor: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { tamanho: { contains: q, mode: Prisma.QueryMode.insensitive } }
          ]
        }
      : undefined,
    include: {
      aluno: { select: { nomeCompleto: true } },
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
    },
    orderBy: { dataPedido: "desc" }
  });

  const normalized = items.map((item) => {
    const firstItem = item.itens.find((pedidoItem) => pedidoItem.produtoId) ?? item.itens[0] ?? null;
    const produto = firstItem?.produto ?? null;

    return {
      ...item,
      clienteNome: item.aluno?.nomeCompleto ?? item.clienteNome,
      produtoId: firstItem?.produtoId ?? null,
      produtoNome: produto?.nome ?? item.modelo ?? "",
      modelo: item.modelo ?? produto?.nome ?? "",
      cor: item.cor ?? produto?.cor ?? "",
      tamanho: item.tamanho ?? produto?.tamanho ?? "",
      produtoEstoqueDisponivel: produto?.estoque ?? null,
      produtoPrecoAtual: produto ? Number(produto.preco) : null
    };
  });

  return ok({ items: normalized });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const alunoId = normalizeOptionalString(body.alunoId);
  const produtoId = normalizeOptionalString(body.produtoId);
  const quantidade = toPositiveInt(body.quantidade, 1);
  const dataPedido = parseDataPedido(body.dataPedido);

  if (!alunoId) {
    return fail("Selecione o aluno do pedido", 400);
  }

  if (!produtoId) {
    return fail("Selecione um produto para o pedido", 400);
  }

  if (!dataPedido) {
    return fail("Data do pedido inválida", 400);
  }

  const alunoResult = await loadAlunoOrFail(alunoId);
  if (!alunoResult.ok) {
    return fail(alunoResult.error, 400);
  }

  const produtoResult = await loadProdutoOrFail(produtoId);
  if (!produtoResult.ok) {
    return fail(produtoResult.error, 400);
  }

  const aluno = alunoResult.aluno;
  const produto = produtoResult.produto;
  if (produto.estoque < quantidade) {
    return fail(`Estoque insuficiente. Disponível: ${produto.estoque}`, 400);
  }

  const valorUnitario = Number(produto.preco);
  const valorTotal = quantidade * valorUnitario;
  const pagoRaw = toNumber(body.pago, 0);
  const pago = Math.max(0, Math.min(pagoRaw, valorTotal));

  let created;
  try {
    created = await prisma.$transaction(async (trx) => {
      const pedido = await trx.pedidoProduto.create({
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
          dataPedido,
          observacao: normalizeOptionalString(body.observacao),
          itens: {
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
    const message = error instanceof Error ? error.message : "Falha ao criar pedido";
    return fail(message, 400);
  }

  await syncAutomaticEntriesInCaixa(true);

  return ok({ item: created }, 201);
}
