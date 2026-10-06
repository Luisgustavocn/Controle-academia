import { MensalidadeStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { syncAutomaticEntriesInCaixa } from "@/lib/services/caixa";

const MENSALIDADE_STATUS_VALUES = new Set<MensalidadeStatus>(Object.values(MensalidadeStatus));
const MONTH_BY_PT_SHORT: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12
};

function parseMonthDayOrDate(value: unknown, competenciaRef: string, fieldName: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${fieldName} inválida`);
    }
    return parsed;
  }

  const match = /^(\d{1,2})[-/](\d{1,2})$/.exec(raw);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (!Number.isInteger(first) || !Number.isInteger(second) || first < 1 || first > 31 || second < 1 || second > 31) {
      throw new Error(`${fieldName} inválida`);
    }

    // Padrão principal: DD-MM. Compatibilidade: MM-DD quando o primeiro campo <= 12 e o segundo > 12.
    let day = first;
    let month = second;
    if (first <= 12 && second > 12) {
      day = second;
      month = first;
    }
    if (month < 1 || month > 12) {
      throw new Error(`${fieldName} inválida`);
    }

    const [competenciaYearRaw, competenciaMonthRaw] = competenciaRef.split("-").map(Number);
    const competenciaYear = Number.isInteger(competenciaYearRaw) ? competenciaYearRaw : new Date().getFullYear();
    const competenciaMonth = Number.isInteger(competenciaMonthRaw) ? competenciaMonthRaw : new Date().getMonth() + 1;
    const resolvedYear = month > competenciaMonth ? competenciaYear - 1 : competenciaYear;
    return new Date(resolvedYear, month - 1, day);
  }

  const textMonthMatch = /^(\d{1,2})[-/](jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)$/i.exec(raw);
  if (textMonthMatch) {
    const day = Number(textMonthMatch[1]);
    const month = MONTH_BY_PT_SHORT[textMonthMatch[2].toLowerCase()];
    if (!Number.isInteger(day) || day < 1 || day > 31 || !month) {
      throw new Error(`${fieldName} inválida`);
    }
    const [competenciaYearRaw, competenciaMonthRaw] = competenciaRef.split("-").map(Number);
    const competenciaYear = Number.isInteger(competenciaYearRaw) ? competenciaYearRaw : new Date().getFullYear();
    const competenciaMonth = Number.isInteger(competenciaMonthRaw) ? competenciaMonthRaw : new Date().getMonth() + 1;
    const resolvedYear = month > competenciaMonth ? competenciaYear - 1 : competenciaYear;
    return new Date(resolvedYear, month - 1, day);
  }

  throw new Error(`${fieldName} inválida. Use DD/mmm (ex.: 02/fev)`);
}

function parseStatus(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const normalized = String(value).toUpperCase() as MensalidadeStatus;
  if (!MENSALIDADE_STATUS_VALUES.has(normalized)) {
    throw new Error("Status de mensalidade inválido");
  }
  return normalized;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "finance.monthlies.manage");
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;

  const previous = await prisma.mensalidade.findUnique({ where: { id } });
  if (!previous) {
    return fail("Mensalidade não encontrada", 404);
  }

  let dataPagamento: Date | null | undefined;
  let status: MensalidadeStatus | undefined;

  try {
    dataPagamento =
      body.dataPagamento === "" ? null : parseMonthDayOrDate(body.dataPagamento, previous.competencia, "dataPagamento") ?? undefined;
    status = parseStatus(body.status);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Dados inválidos", 400);
  }

  const statusFinal = status ?? previous.status;
  if (statusFinal === MensalidadeStatus.PAGO && dataPagamento === undefined && !previous.dataPagamento) {
    dataPagamento = new Date();
  }

  const updated = await prisma.mensalidade.update({
    where: { id },
    data: {
      dataPagamento,
      formaPagamento: body.formaPagamento === "" ? null : (body.formaPagamento as string | undefined),
      status,
      observacao: body.observacao === "" ? null : (body.observacao as string | undefined)
    }
  });

  await logAudit({
    userId: auth.id,
    modulo: "mensalidades",
    entidade: "Mensalidade",
    entidadeId: id,
    acao: "UPDATE",
    antes: previous,
    depois: updated
  });

  await syncAutomaticEntriesInCaixa(true);

  return ok({ item: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = requireCapability(request, "finance.monthlies.manage");
  if (auth instanceof Response) return auth;

  await context.params;
  return fail("Exclusão física de mensalidades está bloqueada para proteger o histórico. Ajuste o status ou os dados da cobrança.", 409);
}
