import { AlunoStatus, MensalidadeStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { currentCompetencia, toCompetencia } from "@/lib/competencia";
import {
    buildVencimentoDate,
    cancelarMensalidadesFuturasDoAluno,
    generateMensalidadesAteCompetencia,
    competenciaFromUtcDate,
    sincronizarMensalidadesComDataInicio,
    sincronizarVencimentoMensalidadesPorAluno
  } from "@/lib/services/mensalidades";
import { createBackupFile } from "@/lib/services/backup";
import { isModalidadePersonalizada } from "@/lib/services/modalidades";

const MENSALIDADE_STATUS_VALUES = new Set<MensalidadeStatus>(Object.values(MensalidadeStatus));

function parseOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} inválida`);
  }
  return parsed;
}

function parseOptionalNumber(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${fieldName} inválido`);
  }
  return parsed;
}

function parseOptionalMensalidadeStatus(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = String(value).toUpperCase() as MensalidadeStatus;
  if (!MENSALIDADE_STATUS_VALUES.has(parsed)) {
    throw new Error("status da mensalidade inválido");
  }
  return parsed;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.RECEPCAO);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const hasMensalidadePayload =
    "mensalidadeValor" in body ||
    "mensalidadeStatus" in body ||
    "mensalidadeDataPagamento" in body ||
    "mensalidadeFormaPagamento" in body ||
    "mensalidadeObservacao" in body;

  let mensalidadeValor: number | null = null;
  let mensalidadeDataPagamento: Date | null = null;
  let mensalidadeStatus: MensalidadeStatus | null = null;
  let dataSaidaCancelamento: Date | null | undefined = undefined;
  const statusInformado = body.status ? (String(body.status).toUpperCase() as AlunoStatus) : undefined;

  try {
    mensalidadeValor = parseOptionalNumber(body.mensalidadeValor, "valor da mensalidade");
    mensalidadeDataPagamento = parseOptionalDate(body.mensalidadeDataPagamento, "data de pagamento da mensalidade");
    mensalidadeStatus = parseOptionalMensalidadeStatus(body.mensalidadeStatus);
    if ("dataSaidaCancelamento" in body) {
      dataSaidaCancelamento = parseOptionalDate(body.dataSaidaCancelamento, "data de saída/cancelamento");
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Dados de mensalidade inválidos", 400);
  }

  const previous = await prisma.aluno.findUnique({
    where: { id },
    include: { modalidade: true }
  });

  if (!previous) {
    return fail("Aluno não encontrado", 404);
  }

  const inicioMesAtual = new Date();
  inicioMesAtual.setHours(0, 0, 0, 0);
  inicioMesAtual.setDate(1);

  let statusFinal = statusInformado ?? previous.status;
  let dataSaidaFinal = dataSaidaCancelamento;
  const hasDataSaidaPayload = "dataSaidaCancelamento" in body;

  if (dataSaidaCancelamento) {
    statusFinal = AlunoStatus.CANCELADO;
  }

  if (statusFinal === AlunoStatus.ATIVO) {
    dataSaidaFinal = null;
  } else if (statusFinal === AlunoStatus.CANCELADO || statusFinal === AlunoStatus.TRANCADO) {
    if (dataSaidaFinal === undefined) {
      dataSaidaFinal = previous.dataSaidaCancelamento ?? inicioMesAtual;
    }
    if (hasDataSaidaPayload && dataSaidaFinal === null) {
      dataSaidaFinal = inicioMesAtual;
    }
  } else if (!hasDataSaidaPayload) {
    dataSaidaFinal = undefined;
  }

  const updated = await prisma.aluno.update({
    where: { id },
    data: {
      nomeCompleto: body.nomeCompleto ? String(body.nomeCompleto) : undefined,
      telefone: body.telefone ? String(body.telefone) : undefined,
      modalidadeId: body.modalidadeId === "" ? null : (body.modalidadeId as string | undefined),
      vencimentoDia: body.vencimentoDia ? Math.min(31, Math.max(1, Number(body.vencimentoDia))) : undefined,
      status: statusFinal,
      dataInicio: body.dataInicio ? new Date(String(body.dataInicio)) : undefined,
      dataSaidaCancelamento: dataSaidaFinal,
      observacoes: body.observacoes === "" ? null : (body.observacoes as string | undefined)
    },
    include: { modalidade: true }
  });

  if (previous.modalidadeId !== updated.modalidadeId) {
    await prisma.historicoPlano.create({
      data: {
        alunoId: id,
        modalidadeAnterior: previous.modalidade?.nome,
        modalidadeNova: updated.modalidade?.nome ?? "Sem modalidade",
        valorAnterior: previous.modalidade?.valorPadrao,
        valorNovo: updated.modalidade?.valorPadrao,
        observacao: `Alterado por ${auth.name}`
      }
    });
  }

  const modalidadeAlterada = previous.modalidadeId !== updated.modalidadeId;

  if (updated.status === AlunoStatus.ATIVO && (hasMensalidadePayload || modalidadeAlterada)) {
    const competenciaPadrao = toCompetencia(new Date());
    const competenciaMensalidade = competenciaPadrao;

    const existingMensalidade = await prisma.mensalidade.findUnique({
      where: {
        alunoId_competencia: {
          alunoId: id,
          competencia: competenciaMensalidade
        }
      }
    });

    const vencimentoPadrao = buildVencimentoDate(competenciaMensalidade, updated.vencimentoDia);
    const valorPadraoModalidade = Number(updated.modalidade?.valorPadrao ?? 0);
    const modalidadePersonalizada = isModalidadePersonalizada(updated.modalidade?.nome);

    const statusMensalidade = mensalidadeStatus ?? existingMensalidade?.status ?? MensalidadeStatus.PENDENTE;
    const valorMensalidade = modalidadePersonalizada
      ? mensalidadeValor ?? Number(existingMensalidade?.valor ?? valorPadraoModalidade)
      : valorPadraoModalidade;
    const vencimentoMensalidade = vencimentoPadrao;
    const dataPagamento =
      mensalidadeDataPagamento ??
      existingMensalidade?.dataPagamento ??
      ((statusMensalidade === MensalidadeStatus.PAGO || statusMensalidade === MensalidadeStatus.PARCIAL) ? new Date() : null);

    await prisma.mensalidade.upsert({
      where: {
        alunoId_competencia: {
          alunoId: id,
          competencia: competenciaMensalidade
        }
      },
      create: {
        alunoId: id,
        competencia: competenciaMensalidade,
        valor: valorMensalidade,
        vencimento: vencimentoMensalidade,
        status: statusMensalidade,
        dataPagamento,
        formaPagamento: body.mensalidadeFormaPagamento
          ? String(body.mensalidadeFormaPagamento)
          : existingMensalidade?.formaPagamento ?? null,
        observacao: body.mensalidadeObservacao
          ? String(body.mensalidadeObservacao)
          : existingMensalidade?.observacao ?? null
      },
      update: {
        valor: valorMensalidade,
        vencimento: vencimentoMensalidade,
        status: statusMensalidade,
        dataPagamento,
        formaPagamento: body.mensalidadeFormaPagamento === ""
          ? existingMensalidade?.formaPagamento ?? null
          : (body.mensalidadeFormaPagamento as string | undefined),
        observacao: body.mensalidadeObservacao === ""
          ? existingMensalidade?.observacao ?? null
          : (body.mensalidadeObservacao as string | undefined)
      }
    });
  }

  if (previous.vencimentoDia !== updated.vencimentoDia) {
    await sincronizarVencimentoMensalidadesPorAluno(id);
  }

  const competenciaAnteriorInicio = competenciaFromUtcDate(previous.dataInicio);
  const competenciaAtualInicio = competenciaFromUtcDate(updated.dataInicio);
  if (competenciaAnteriorInicio !== competenciaAtualInicio) {
    await sincronizarMensalidadesComDataInicio(id, updated.dataInicio);
  }

  if (updated.status === AlunoStatus.CANCELADO || updated.status === AlunoStatus.TRANCADO) {
    const referenciaSaida = updated.dataSaidaCancelamento ?? inicioMesAtual;
    await cancelarMensalidadesFuturasDoAluno(id, referenciaSaida);
  } else if (updated.dataSaidaCancelamento) {
    await cancelarMensalidadesFuturasDoAluno(id, updated.dataSaidaCancelamento);
  }

  if (updated.status === AlunoStatus.ATIVO) {
    await generateMensalidadesAteCompetencia(currentCompetencia(), [id]);
  }

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, UserRole.ADMIN);
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const previous = await prisma.aluno.findUnique({ where: { id } });
  if (!previous) {
    return fail("Aluno não encontrado", 404);
  }

  const backup = await createBackupFile();
  const dataSaida = previous.dataSaidaCancelamento ?? new Date();
  const updated = await prisma.aluno.update({
    where: { id },
    data: {
      status: AlunoStatus.CANCELADO,
      dataSaidaCancelamento: dataSaida
    }
  });

  await cancelarMensalidadesFuturasDoAluno(id, dataSaida);

  await logAudit({
    userId: auth.id,
    modulo: "alunos",
    entidade: "Aluno",
    entidadeId: id,
    acao: "ARCHIVE",
    antes: previous,
    depois: updated
  });

  return ok({ ok: true, archived: true, backupFilePath: backup.filePath });
}
