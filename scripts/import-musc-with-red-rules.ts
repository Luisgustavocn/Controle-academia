import fs from "node:fs";
import * as XLSX from "xlsx";
import { AlunoStatus, MensalidadeStatus, PrismaClient } from "@prisma/client";
import { importOnlyMuscFromExcelBuffer } from "@/lib/excel/importer";

const prisma = new PrismaClient();

const RED_NAMES = [
  "Ariane Cristene Oliveira",
  "Cenira Rodrigues Aires",
  "Flavia de souza",
  "Indiara Casali",
  "Isabele Rubim Mortari",
  "Jade Lima Ferreira",
  "Juliete Duarte",
  "Laysa Bulegon",
  "Mari terezinha Linhar",
  "Mariana Rapachi",
  "Ronaldo Gambim",
  "Rosane Fernandes(jane)",
  "Roseli gazola",
  "Vitor Nascimento"
];

const MONTH_LABELS: Array<{ key: string; month: number }> = [
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

function isPaidValue(value: unknown) {
  if (value === null || value === undefined) return false;
  const normalized = text(value).toLowerCase();
  if (!normalized) return false;
  if (["1", "x", "ok", "pago", "sim", "s", "true", "p", "pg"].includes(normalized)) return true;
  return numberOrZero(value) > 0;
}

function readMuscRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets["Musc"];
  if (!sheet) return [];

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = rawRows.findIndex((row) => {
    const normalized = row.map((cell) => normalize(text(cell)));
    return normalized.includes("telefone") && normalized.some((cell) => cell.startsWith("venc"));
  });
  if (headerIndex < 0) return [];

  const headerRow = rawRows[headerIndex] ?? [];
  const headers = headerRow.map((cell, index) => {
    const normalized = normalize(text(cell));
    if (normalized) return normalized;
    return index === 0 ? "nome" : `col${index}`;
  });

  return rawRows.slice(headerIndex + 1).map((row) => {
    const mapped: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) {
      mapped[headers[i]] = row[i];
    }
    if (!mapped.nome && row[0] !== undefined && row[0] !== null) {
      mapped.nome = row[0];
    }
    return mapped;
  });
}

function competenciaFromUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function main() {
  const filePath = "/Users/luisgustavo/Downloads/Controle academia 2026 (1).xlsx";
  const buffer = fs.readFileSync(filePath);

  const importResult = await importOnlyMuscFromExcelBuffer(buffer, 2026);
  const muscRows = readMuscRows(buffer);
  const rowByName = new Map(muscRows.map((row) => [normalize(text(row.nome || row.nomecompleto || row.aluno)), row]));

  const alunos = await prisma.aluno.findMany({
    select: {
      id: true,
      nomeCompleto: true,
      dataInicio: true
    }
  });
  const alunoByName = new Map(alunos.map((aluno) => [normalize(aluno.nomeCompleto), aluno]));

  let redFound = 0;
  let redUpdated = 0;
  let redMissing = 0;

  for (const rawName of RED_NAMES) {
    const key = normalize(rawName);
    const row = rowByName.get(key);
    const aluno = alunoByName.get(key);
    if (!row || !aluno) {
      redMissing += 1;
      continue;
    }

    redFound += 1;
    let firstPaidMonth: number | null = null;

    for (const month of MONTH_LABELS) {
      if (isPaidValue(row[month.key])) {
        firstPaidMonth = month.month;
        break;
      }
    }

    let dataSaidaCancelamento: Date;
    if (firstPaidMonth) {
      // Pagou no mês X e para no próximo.
      dataSaidaCancelamento = new Date(Date.UTC(2026, firstPaidMonth, 1));
    } else {
      // Sem pagamento: tratar como se tivesse parado no mês anterior a jan/2026.
      dataSaidaCancelamento = new Date(Date.UTC(2025, 11, 1));
    }

    const dataInicioAjustada =
      aluno.dataInicio.getTime() > dataSaidaCancelamento.getTime() ? dataSaidaCancelamento : aluno.dataInicio;

    await prisma.aluno.update({
      where: { id: aluno.id },
      data: {
        status: AlunoStatus.CANCELADO,
        dataInicio: dataInicioAjustada,
        dataSaidaCancelamento
      }
    });

    const competenciaSaida = competenciaFromUtcDate(dataSaidaCancelamento);
    await prisma.mensalidade.updateMany({
      where: {
        alunoId: aluno.id,
        competencia: {
          gt: competenciaSaida
        },
        status: {
          in: [MensalidadeStatus.PENDENTE, MensalidadeStatus.ATRASADO]
        }
      },
      data: {
        status: MensalidadeStatus.ISENTO,
        dataPagamento: null,
        formaPagamento: null,
        observacao: "Mensalidade isenta por cancelamento do aluno (linha vermelha)"
      }
    });

    redUpdated += 1;
  }

  const totals = {
    alunos: await prisma.aluno.count(),
    modalidades: await prisma.modalidade.count(),
    mensalidades: await prisma.mensalidade.count(),
    cancelados: await prisma.aluno.count({ where: { status: AlunoStatus.CANCELADO } }),
    ativos: await prisma.aluno.count({ where: { status: AlunoStatus.ATIVO } })
  };

  console.log(
    JSON.stringify(
      {
        importResult,
        redRules: {
          totalConfigured: RED_NAMES.length,
          redFound,
          redUpdated,
          redMissing
        },
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
