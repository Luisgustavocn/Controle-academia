import fs from "node:fs";
import * as XLSX from "xlsx";
import { AlunoStatus, MensalidadeStatus, PrismaClient } from "@prisma/client";
import { buildVencimentoDate } from "@/lib/services/mensalidades";

const prisma = new PrismaClient();

const SOURCE_FILE = "/Users/luisgustavo/Downloads/Controle academia 2026 (1).xlsx";
const IMPORT_YEAR = 2026;

const MONTHS: Array<{ key: string; month: number }> = [
  { key: "jan", month: 1 },
  { key: "fev", month: 2 },
  { key: "mar", month: 3 },
  { key: "abr", month: 4 },
  { key: "mai", month: 5 },
  { key: "jun", month: 6 },
  { key: "jul", month: 7 },
  { key: "ago", month: 8 },
  { key: "set", month: 9 },
  { key: "out", month: 10 },
  { key: "nov", month: 11 },
  { key: "dez", month: 12 }
];

type MuscRow = {
  nome: string;
  telefone: string;
  modalidade: string;
  vencimentoDia: number;
  monthValues: Record<number, number | null>;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrZero(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const cleaned = String(value)
    .replace(/\s+/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeModalidade(modalidadeRaw: string) {
  const clean = modalidadeRaw.trim();
  if (!clean) return "";

  const key = normalize(clean);
  const canonicalMap: Record<string, string> = {
    todososdias: "todos os dias",
    "3xmusc": "3xmusc",
    "3xnusc": "3xmusc",
    "3xmusc2xfuncional": "3xmusc2xfuncional",
    "1xmusc": "1xmusc",
    "3xpersonal": "3xpersonal",
    "3xpersonal2xsozinha": "3xpersonal2xsozinha",
    "2xpersonal": "2xpersonal",
    "2xpersonal1xsozinha": "2xpersonal+1sozinho",
    "2xpersonal1xsozinho": "2xpersonal+1sozinho",
    "2xpersonal1sozinha": "2xpersonal+1sozinho",
    "2xpersonal1sozinho": "2xpersonal+1sozinho",
    "2xpersonal2xsozinha": "2xpersonal2xsozinha",
    "2xpersonal2xsozinho": "2xpersonal2xsozinha",
    "2xfuncional": "2xfuncional",
    "1xfuncional": "1xfuncional",
    "2xfuncionalkids": "2xfuncional kids",
    "1xfuncionalkids": "1xfuncional kids",
    "2xpersonal2xfuncional": "2xpersonal2xfuncional"
  };

  return canonicalMap[key] ?? clean.toLowerCase();
}

function competencia(month: number) {
  return `${IMPORT_YEAR}-${String(month).padStart(2, "0")}`;
}

function readMuscRows(filePath: string) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets["Musc"];
  if (!sheet) return [] as MuscRow[];

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = rawRows.findIndex((row) => {
    const normalized = row.map((cell) => normalize(text(cell)));
    return normalized.includes("telefone") && normalized.some((cell) => cell.startsWith("venc"));
  });
  if (headerIndex < 0) return [] as MuscRow[];

  const headerRow = rawRows[headerIndex] ?? [];
  const headers = headerRow.map((cell, index) => {
    const normalized = normalize(text(cell));
    if (normalized) return normalized;
    return index === 0 ? "nome" : `col${index}`;
  });

  const allRows = rawRows.slice(headerIndex + 1);
  const rows: MuscRow[] = [];

  for (const row of allRows) {
    const mapped: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) {
      mapped[headers[i]] = row[i];
    }

    const nome = text(mapped.nome || row[0]);
    if (!nome || ["nome", "aluno"].includes(normalize(nome))) continue;

    const telefone = text(mapped.telefone || mapped.fone || mapped.whatsapp) || "0";
    const modalidade = normalizeModalidade(text(mapped.modalidade || mapped.plano || mapped.turma));
    const vencimentoDia = Math.max(
      1,
      Math.min(31, Math.trunc(numberOrZero(mapped.venc || mapped.vencimento || mapped.vence || mapped.dia || 10) || 10))
    );

    const monthValues: Record<number, number | null> = {};
    for (const m of MONTHS) {
      const raw = mapped[m.key];
      if (raw === undefined || raw === null || text(raw) === "") {
        monthValues[m.month] = null;
      } else {
        const parsed = numberOrZero(raw);
        monthValues[m.month] = parsed > 0 ? parsed : null;
      }
    }

    rows.push({
      nome,
      telefone,
      modalidade,
      vencimentoDia,
      monthValues
    });
  }

  return rows;
}

function detectObservedLimit(rows: MuscRow[]) {
  let maxMonth = 1;
  for (const row of rows) {
    for (const m of MONTHS) {
      if (row.monthValues[m.month] !== null) {
        maxMonth = Math.max(maxMonth, m.month);
      }
    }
  }
  return maxMonth;
}

function resolveCutoffMonth(observedLimit: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (IMPORT_YEAR < currentYear) return observedLimit;
  if (IMPORT_YEAR > currentYear) return 1;
  return Math.max(1, Math.min(observedLimit, currentMonth));
}

function analyzeTimeline(row: MuscRow, cutoffMonth: number) {
  const paidMonths = MONTHS.map((m) => m.month)
    .filter((month) => month <= cutoffMonth)
    .filter((month) => (row.monthValues[month] ?? 0) > 0);

  if (paidMonths.length === 0) {
    return {
      hasPayment: false,
      startMonth: null as number | null,
      endMonth: null as number | null,
      stopped: true
    };
  }

  // Regra: se ficou mais de 1 mes sem pagar e depois pagou, considera reinicio.
  let startIndex = 0;
  for (let i = 1; i < paidMonths.length; i += 1) {
    const gap = paidMonths[i] - paidMonths[i - 1] - 1;
    if (gap >= 2) {
      startIndex = i;
    }
  }

  const activePaidMonths = paidMonths.slice(startIndex);
  const startMonth = activePaidMonths[0];
  const lastPaidMonth = activePaidMonths[activePaidMonths.length - 1];

  // Regra: se ficou 2 meses ou mais sem pagar, apos ultimo pagamento parou.
  const monthsWithoutAfterLastPaid = cutoffMonth - lastPaidMonth;
  const stopped = monthsWithoutAfterLastPaid >= 2;

  return {
    hasPayment: true,
    startMonth,
    endMonth: stopped ? lastPaidMonth : cutoffMonth,
    stopped
  };
}

async function findOrCreateModalidade(nome: string, valorPadrao: number) {
  if (!nome) return null;
  return prisma.modalidade.upsert({
    where: { nome },
    update: {
      valorPadrao
    },
    create: {
      nome,
      valorPadrao
    }
  });
}

async function upsertAluno(row: MuscRow, startMonth: number | null, stopped: boolean, endMonth: number | null) {
  const telefone = row.telefone || "0";

  const existing = await prisma.aluno.findFirst({
    where: {
      nomeCompleto: row.nome,
      telefone
    }
  });

  const valorModalidade =
    MONTHS.map((m) => row.monthValues[m.month]).find((v) => v !== null && v > 0) ?? 0;
  const modalidade = await findOrCreateModalidade(row.modalidade, valorModalidade);

  const baseStartMonth = startMonth ?? 1;
  const maxDayInStartMonth = new Date(Date.UTC(IMPORT_YEAR, baseStartMonth, 0)).getUTCDate();
  const startDate = new Date(
    Date.UTC(IMPORT_YEAR, baseStartMonth - 1, Math.min(row.vencimentoDia, Math.max(1, maxDayInStartMonth)))
  );

  let dataSaidaCancelamento: Date | null = null;
  if (stopped && endMonth) {
    dataSaidaCancelamento = new Date(Date.UTC(IMPORT_YEAR, endMonth, 1));
  }

  if (existing) {
    return prisma.aluno.update({
      where: { id: existing.id },
      data: {
        telefone,
        modalidadeId: modalidade?.id ?? existing.modalidadeId,
        vencimentoDia: row.vencimentoDia,
        dataInicio: startDate,
        status: stopped ? AlunoStatus.CANCELADO : AlunoStatus.ATIVO,
        dataSaidaCancelamento
      }
    });
  }

  return prisma.aluno.create({
    data: {
      nomeCompleto: row.nome,
      telefone,
      modalidadeId: modalidade?.id ?? null,
      vencimentoDia: row.vencimentoDia,
      dataInicio: startDate,
      status: stopped ? AlunoStatus.CANCELADO : AlunoStatus.ATIVO,
      dataSaidaCancelamento
    }
  });
}

async function replaceMensalidadesForAluno(row: MuscRow, alunoId: string, startMonth: number, endMonth: number) {
  await prisma.mensalidade.deleteMany({ where: { alunoId } });

  const defaultCharge =
    MONTHS.map((m) => m.month)
      .filter((month) => month >= startMonth && month <= endMonth)
      .map((month) => row.monthValues[month])
      .find((v) => v !== null && v > 0) ?? 0;

  const inserts: Array<{
    alunoId: string;
    competencia: string;
    valor: number;
    vencimento: Date;
    dataPagamento: Date | null;
    status: MensalidadeStatus;
    observacao: string;
  }> = [];

  for (let month = startMonth; month <= endMonth; month += 1) {
    const value = row.monthValues[month];
    const paid = value !== null && value > 0;
    const dueDate = buildVencimentoDate(competencia(month), row.vencimentoDia);

    const maxDay = new Date(Date.UTC(IMPORT_YEAR, month, 0)).getUTCDate();
    const paymentDate = paid
      ? new Date(Date.UTC(IMPORT_YEAR, month - 1, Math.min(row.vencimentoDia, maxDay)))
      : null;

    inserts.push({
      alunoId,
      competencia: competencia(month),
      valor: paid ? value : defaultCharge,
      vencimento: dueDate,
      dataPagamento: paymentDate,
      status: paid ? MensalidadeStatus.PAGO : MensalidadeStatus.PENDENTE,
      observacao: "Importado da aba Musc (regra de gaps aplicada)"
    });
  }

  if (inserts.length > 0) {
    await prisma.mensalidade.createMany({ data: inserts });
  }
}

async function main() {
  const rows = readMuscRows(SOURCE_FILE);
  if (rows.length === 0) {
    console.log(JSON.stringify({ ok: false, error: "Aba Musc não encontrada ou sem dados." }, null, 2));
    return;
  }

  const observedLimit = detectObservedLimit(rows);
  const cutoffMonth = resolveCutoffMonth(observedLimit);
  let imported = 0;
  let active = 0;
  let canceled = 0;
  let mensalidades = 0;

  for (const row of rows) {
    const analysis = analyzeTimeline(row, cutoffMonth);
    const aluno = await upsertAluno(row, analysis.startMonth, analysis.stopped, analysis.endMonth);
    imported += 1;

    if (analysis.hasPayment && analysis.startMonth && analysis.endMonth) {
      await replaceMensalidadesForAluno(row, aluno.id, analysis.startMonth, analysis.endMonth);
      mensalidades += analysis.endMonth - analysis.startMonth + 1;
    } else {
      await prisma.mensalidade.deleteMany({ where: { alunoId: aluno.id } });
    }

    if (analysis.stopped) canceled += 1;
    else active += 1;
  }

  const totals = {
    alunos: await prisma.aluno.count(),
    modalidades: await prisma.modalidade.count(),
    mensalidades: await prisma.mensalidade.count(),
    ativos: await prisma.aluno.count({ where: { status: AlunoStatus.ATIVO } }),
    cancelados: await prisma.aluno.count({ where: { status: AlunoStatus.CANCELADO } })
  };

  console.log(
    JSON.stringify(
      {
        ok: true,
        file: SOURCE_FILE,
        importYear: IMPORT_YEAR,
        observedLimit,
        cutoffMonth,
        imported,
        active,
        canceled,
        mensalidadesCriadasAproximadas: mensalidades,
        totals
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
