import * as XLSX from "xlsx";
import { AlunoStatus, MensalidadeStatus, TipoMovimentacao, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { confirmAttendance } from "@/lib/services/attendance";

const MONTH_LABELS: Record<string, number> = {
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

const PAID_MARKERS = new Set(["1", "x", "ok", "pago", "sim", "s", "true", "p", "pg"]);

const SUPPORTED_IMPORT_SHEETS = new Set([
  "Musc",
  "caixa",
  "despesa academia",
  "Personal",
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
  "roupas",
  "Pedido"
]);

export class InvalidSpreadsheetError extends Error {
  constructor() {
    super("Arquivo Excel inválido ou não reconhecido");
    this.name = "InvalidSpreadsheetError";
  }
}

export function parseSpreadsheetBuffer(fileBuffer: Buffer) {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  } catch {
    throw new InvalidSpreadsheetError();
  }

  if (!workbook.SheetNames.some((sheetName) => SUPPORTED_IMPORT_SHEETS.has(sheetName))) {
    throw new InvalidSpreadsheetError();
  }

  return workbook;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d);
    }
  }
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date;
  const parts = text.split(/[\/\-]/).map(Number);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dd = y < 100 ? 2000 + y : y;
    const parsed = new Date(dd, m - 1, d);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function numberOrZero(value: unknown) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function monthCellValue(mapped: Record<string, unknown>, monthName: string, importYear: number) {
  const keys = [
    monthName,
    `${monthName}2026`,
    `${monthName}${importYear}`,
    `${monthName}${String(importYear).slice(-2)}`
  ];

  for (const key of keys) {
    if (mapped[key] !== undefined && mapped[key] !== null && String(mapped[key]).trim() !== "") {
      return mapped[key];
    }
  }

  return undefined;
}

function isPaidValue(value: unknown) {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;
  if (PAID_MARKERS.has(normalized)) return true;
  return numberOrZero(value) > 0;
}

function firstPaymentDateFromRow(mapped: Record<string, unknown>, importYear: number, dayFallback: number) {
  for (const [monthName, monthNum] of Object.entries(MONTH_LABELS)) {
    const paidCell = monthCellValue(mapped, monthName, importYear);
    if (!isPaidValue(paidCell)) continue;

    const baseDay = dayFallback;
    const maxDay = new Date(importYear, monthNum, 0).getDate();
    const day = Math.max(1, Math.min(maxDay, baseDay));
    return new Date(importYear, monthNum - 1, day);
  }

  return null;
}

async function findOrCreateModalidade(nome: string, valorPadrao: number | null = null) {
  if (!nome) return null;
  return prisma.modalidade.upsert({
    where: { nome },
    update: {},
    create: {
      nome,
      valorPadrao
    }
  });
}

async function upsertAluno(data: {
  nomeCompleto: string;
  telefone?: string;
  modalidadeNome?: string;
  vencimentoDia?: number;
  dataInicio?: Date | null;
  valorMensal?: number | null;
  usarValorPadrao?: boolean;
  status?: AlunoStatus;
  observacoes?: string;
}) {
  const normalizedTelefone = text(data.telefone) || "0";

  const existing = await prisma.aluno.findFirst({
    where: {
      nomeCompleto: data.nomeCompleto,
      telefone: normalizedTelefone
    }
  });

  let modalidadeId: string | null = null;
  if (data.modalidadeNome) {
    const modalidade = await findOrCreateModalidade(data.modalidadeNome);
    modalidadeId = modalidade?.id ?? null;
  }

  if (existing) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.aluno.update({
        where: { id: existing.id },
        data: {
          modalidadeId: modalidadeId ?? existing.modalidadeId,
          vencimentoDia: data.vencimentoDia ?? existing.vencimentoDia,
          dataInicio: data.dataInicio === undefined ? existing.dataInicio : data.dataInicio,
          valorMensal: data.valorMensal === undefined ? existing.valorMensal : data.valorMensal,
          usarValorPadrao: data.usarValorPadrao ?? existing.usarValorPadrao,
          status: data.status ?? existing.status,
          telefone: normalizedTelefone,
          observacoes: data.observacoes || existing.observacoes
        }
      });
      if ((data.status ?? existing.status) === AlunoStatus.ATIVO) {
        const open = await tx.periodoMatricula.findFirst({ where: { alunoId: existing.id, dataSaida: null } });
        if (open) {
          await tx.periodoMatricula.update({ where: { id: open.id }, data: {
            modalidadeId: updated.modalidadeId, diaVencimento: updated.vencimentoDia,
            valorMensal: updated.valorMensal, usarValorPadrao: updated.usarValorPadrao
          } });
        } else {
          await tx.periodoMatricula.create({ data: {
            alunoId: existing.id, dataInicio: updated.dataInicio, modalidadeId: updated.modalidadeId,
            diaVencimento: updated.vencimentoDia, valorMensal: updated.valorMensal,
            usarValorPadrao: updated.usarValorPadrao
          } });
        }
      }
      return updated;
    });
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.aluno.create({
      data: {
        nomeCompleto: data.nomeCompleto,
        telefone: normalizedTelefone,
        modalidadeId,
        vencimentoDia: data.vencimentoDia ?? 10,
        dataInicio: data.dataInicio ?? null,
        valorMensal: data.valorMensal ?? null,
        usarValorPadrao: data.usarValorPadrao ?? true,
        status: data.status ?? AlunoStatus.ATIVO,
        observacoes: data.observacoes || null
      }
    });
    if (created.status === AlunoStatus.ATIVO) {
      await tx.periodoMatricula.create({ data: {
        alunoId: created.id, dataInicio: created.dataInicio, modalidadeId: created.modalidadeId,
        diaVencimento: created.vencimentoDia, valorMensal: created.valorMensal,
        usarValorPadrao: created.usarValorPadrao
      } });
    }
    return created;
  });
}

async function importMusc(workbook: XLSX.WorkBook, importYear: number) {
  const sheet = workbook.Sheets["Musc"];
  if (!sheet) return { alunos: 0, mensalidades: 0 };

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = rawRows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeKey(text(cell)));
    return normalized.includes("telefone") && normalized.some((cell) => cell.startsWith("venc"));
  });
  if (headerIndex < 0) return { alunos: 0, mensalidades: 0 };

  const headerRow = rawRows[headerIndex] ?? [];
  const headers = headerRow.map((cell, index) => {
    const normalized = normalizeKey(text(cell));
    if (normalized) return normalized;
    return index === 0 ? "nome" : `col${index}`;
  });

  const rows = rawRows.slice(headerIndex + 1).map((row) => {
    const mapped: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) {
      mapped[headers[i]] = row[i];
    }
    if (!mapped.nome && row[0] !== undefined && row[0] !== null) {
      mapped.nome = row[0];
    }
    return mapped;
  });

  let alunosCount = 0;
  let mensalidadesCount = 0;

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeKey(key)] = value;
    }

    const nome = text(mapped.nome || mapped.nomecompleto || mapped.aluno);
    if (!nome || ["nome", "aluno"].includes(normalizeKey(nome))) continue;

    const telefone = text(mapped.telefone || mapped.fone || mapped.whatsapp) || "0";
    const modalidadeNome = text(mapped.modalidade || mapped.plano || mapped.turma);
    const vencimentoDia = Math.max(
      1,
      Math.min(31, Math.trunc(numberOrZero(mapped.venc || mapped.vencimento || mapped.vence || mapped.dia || 10) || 10))
    );
    const dataInicioFromPrimeiroPagamento = firstPaymentDateFromRow(mapped, importYear, vencimentoDia);

    const aluno = await upsertAluno({
      nomeCompleto: nome,
      telefone,
      modalidadeNome,
      vencimentoDia,
      dataInicio:
        dataInicioFromPrimeiroPagamento ??
        parseDate(mapped.datainicio || mapped.inicio),
      status: AlunoStatus.ATIVO,
      observacoes: text(mapped.observacoes || mapped.obs)
    });

    alunosCount += 1;

    for (const [monthName, monthNum] of Object.entries(MONTH_LABELS)) {
      const paidCell = monthCellValue(mapped, monthName, importYear);
      if (paidCell === undefined || paidCell === null || String(paidCell).trim() === "") continue;

      const valor = numberOrZero(paidCell) || 0;
      const competencia = `${importYear}-${String(monthNum).padStart(2, "0")}`;
      const paid = isPaidValue(paidCell);

      const configuredValue = aluno.valorMensal !== null
        ? Number(aluno.valorMensal)
        : aluno.usarValorPadrao && aluno.modalidadeId
          ? Number((await prisma.modalidade.findUnique({ where: { id: aluno.modalidadeId } }))?.valorPadrao ?? Number.NaN)
          : Number.NaN;
      const monthlyValue = valor > 0 ? valor : configuredValue;
      if (!Number.isFinite(monthlyValue)) continue;

      await prisma.mensalidade.upsert({
        where: {
          alunoId_competencia: {
            alunoId: aluno.id,
            competencia
          }
        },
        create: {
          alunoId: aluno.id,
          competencia,
          valor: monthlyValue,
          vencimento: new Date(importYear, monthNum - 1, Math.min(vencimentoDia, 28)),
          dataPagamento: paid ? new Date(importYear, monthNum - 1, Math.min(vencimentoDia, 28)) : null,
          status: paid ? MensalidadeStatus.PAGO : MensalidadeStatus.PENDENTE,
          observacao: "Importado da planilha Musc"
        },
        update: {
          dataPagamento: paid ? new Date(importYear, monthNum - 1, Math.min(vencimentoDia, 28)) : null,
          status: paid ? MensalidadeStatus.PAGO : MensalidadeStatus.PENDENTE
        }
      });

      mensalidadesCount += 1;
    }
  }

  return { alunos: alunosCount, mensalidades: mensalidadesCount };
}

async function importCaixa(workbook: XLSX.WorkBook, importYear: number) {
  const sheet = workbook.Sheets["caixa"];
  if (!sheet) return { movimentos: 0 };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  let movimentos = 0;

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeKey(key)] = value;
    }

    const descricao = text(mapped.descricao || mapped.historico || mapped.movimento);
    if (!descricao || ["descricao", "historico"].includes(normalizeKey(descricao))) continue;

    const data = parseDate(mapped.data) || new Date(importYear, 0, 1);
    const valorEntrada = numberOrZero(mapped.entrada || mapped.receita);
    const valorSaida = numberOrZero(mapped.saida || mapped.despesa);
    const valor = valorEntrada > 0 ? valorEntrada : valorSaida;
    if (!valor) continue;

    const tipo = valorEntrada > 0 ? TipoMovimentacao.ENTRADA : TipoMovimentacao.SAIDA;
    const competencia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;

    await prisma.movimentacaoCaixa.create({
      data: {
        data,
        tipo,
        descricao,
        valor,
        origemDestino: text(mapped.origem || mapped.destino || mapped.origemdestino) || null,
        formaPagamento: text(mapped.formapagamento || mapped.forma) || null,
        competencia,
        observacao: "Importado da planilha caixa"
      }
    });

    movimentos += 1;
  }

  return { movimentos };
}

async function importDespesas(workbook: XLSX.WorkBook, sheetName: "despesa academia", importYear: number) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { despesas: 0 };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  let despesas = 0;

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeKey(key)] = value;
    }

    const descricao = text(mapped.descricao || mapped.conta || mapped.item);
    if (!descricao || ["descricao", "conta"].includes(normalizeKey(descricao))) continue;

    const vencimento = parseDate(mapped.datavencimento || mapped.vencimento || mapped.data) || new Date(importYear, 0, 10);
    const competencia = `${vencimento.getFullYear()}-${String(vencimento.getMonth() + 1).padStart(2, "0")}`;
    const valorPrevisto = numberOrZero(mapped.valorprevisto || mapped.valor || mapped.previsto);
    const valorPago = numberOrZero(mapped.valorpago || mapped.pago);

    const categoriaNome = text(mapped.categoria || mapped.tipo) || "Academia";
    const categoria = await prisma.categoriaFinanceira.upsert({
      where: { nome: categoriaNome },
      update: {},
      create: { nome: categoriaNome }
    });

    await prisma.despesaAcademia.create({
      data: {
        dataVencimento: vencimento,
        competencia,
        descricao,
        categoriaId: categoria.id,
        valorPrevisto,
        valorPago,
        status: valorPago >= valorPrevisto && valorPrevisto > 0 ? "PAGO" : valorPago > 0 ? "PARCIAL" : "PENDENTE",
        dataPagamento: valorPago > 0 ? vencimento : null,
        observacao: "Importado da planilha despesa academia"
      }
    });

    despesas += 1;
  }

  return { despesas };
}

async function importAgenda(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets["Personal"];
  if (!sheet) return { agendaSlots: 0 };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  let agendaSlots = 0;

  const dias = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeKey(key)] = value;
    }

    const professor = text(mapped.professor || mapped.personal || mapped.responsavel || "Equipe");
    const horario = text(mapped.horario || mapped.hora);
    if (!horario) continue;

    for (let i = 0; i < dias.length; i += 1) {
      const dayKey = dias[i];
      const alunoNome = text(mapped[dayKey] || mapped[`dia${i + 1}`]);
      if (!alunoNome) continue;

      await prisma.agendaPersonal.create({
        data: {
          professor,
          diaSemana: i + 1,
          horario,
          alunoNome,
          tipoAula: "personal",
          observacao: "Importado da aba Personal",
          semanaRef: "importada"
        }
      });
      agendaSlots += 1;
    }
  }

  return { agendaSlots };
}

async function importPresencas(workbook: XLSX.WorkBook, importYear: number, actorId: string) {
  let presencas = 0;

  for (const [monthName, monthNum] of Object.entries(MONTH_LABELS)) {
    const sheetName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    for (const row of rows) {
      const mapped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        mapped[normalizeKey(key)] = value;
      }

      const nome = text(mapped.nome || mapped.aluno || mapped.nomes);
      if (!nome || ["nome", "aluno"].includes(normalizeKey(nome))) continue;

      const aluno = await prisma.aluno.findFirst({ where: { nomeCompleto: nome } });
      if (!aluno) continue;

      for (let day = 1; day <= 31; day += 1) {
        const marker = mapped[String(day)] ?? mapped[`dia${day}`];
        if (String(marker).trim() !== "1") continue;

        const data = `${importYear}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (new Date(`${data}T00:00:00.000Z`).getUTCMonth() !== monthNum - 1) continue;

        await confirmAttendance({
          alunoId: aluno.id,
          data,
          horario: null,
          tipoAula: "musculação",
          observacao: `Importado da aba ${sheetName}`
        }, { id: actorId, role: UserRole.ADMIN });

        presencas += 1;
      }
    }
  }

  return { presencas };
}

async function importProdutosPedidos(workbook: XLSX.WorkBook, importYear: number) {
  let produtos = 0;
  let pedidos = 0;

  const roupasSheet = workbook.Sheets["roupas"];
  if (roupasSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(roupasSheet, { defval: "" });
    for (const row of rows) {
      const mapped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        mapped[normalizeKey(key)] = value;
      }

      const nome = text(mapped.nome || mapped.produto || mapped.modelo);
      if (!nome || ["nome", "produto"].includes(normalizeKey(nome))) continue;

      await prisma.produto.create({
        data: {
          nome,
          categoria: text(mapped.categoria || "roupa"),
          tamanho: text(mapped.tamanho) || null,
          cor: text(mapped.cor) || null,
          preco: numberOrZero(mapped.preco || mapped.valor || 0),
          estoque: Math.trunc(numberOrZero(mapped.estoque || mapped.quantidade || 0))
        }
      });

      produtos += 1;
    }
  }

  const pedidoSheet = workbook.Sheets["Pedido"];
  if (pedidoSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(pedidoSheet, { defval: "" });
    for (const row of rows) {
      const mapped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        mapped[normalizeKey(key)] = value;
      }

      const clienteNome = text(mapped.cliente || mapped.nome || mapped.aluno);
      if (!clienteNome || ["cliente", "nome"].includes(normalizeKey(clienteNome))) continue;

      const quantidade = Math.max(1, Math.trunc(numberOrZero(mapped.quantidade || 1)));
      const valorUnitario = numberOrZero(mapped.valorunitario || mapped.valor || 0);

      await prisma.pedidoProduto.create({
        data: {
          clienteNome,
          modelo: text(mapped.modelo) || null,
          cor: text(mapped.cor) || null,
          tamanho: text(mapped.tamanho) || null,
          quantidade,
          valorUnitario,
          valorTotal: numberOrZero(mapped.valortotal || quantidade * valorUnitario),
          pago: numberOrZero(mapped.pago || 0),
          dataPedido: parseDate(mapped.datapedido || mapped.data) || new Date(importYear, 0, 1),
          observacao: "Importado da aba Pedido"
        }
      });

      pedidos += 1;
    }
  }

  return { produtos, pedidos };
}

export async function importFromExcelBuffer(fileBuffer: Buffer, importYear: number, actorId: string) {
  const workbook = parseSpreadsheetBuffer(fileBuffer);

  const result = {
    musc: await importMusc(workbook, importYear),
    caixa: await importCaixa(workbook, importYear),
    despesaAcademia: await importDespesas(workbook, "despesa academia", importYear),
    agenda: await importAgenda(workbook),
    presencas: await importPresencas(workbook, importYear, actorId),
    produtosPedidos: await importProdutosPedidos(workbook, importYear)
  };

  return result;
}

export async function importOnlyMuscFromExcelBuffer(fileBuffer: Buffer, importYear = new Date().getFullYear()) {
  const workbook = parseSpreadsheetBuffer(fileBuffer);
  const musc = await importMusc(workbook, importYear);
  return { musc };
}
