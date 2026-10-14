import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { Prisma, TipoMovimentacao, type PrismaClient } from "@prisma/client";
import { civilDateToPrisma, parseCivilDate, prismaDateToCivil } from "@/lib/attendance-date";
import { parseCsv } from "@/lib/import/financial-history-2026";
import { normalizePersonName } from "@/lib/import/october-2026";

const REQUIRED_FILES = [
  "manifest.json",
  "presencas_janeiro_resolvidas.csv",
  "presencas_janeiro_pendentes.csv",
  "aliases_presenca_alta_confianca.csv",
  "nomes_presenca_pendentes.csv",
  "caixa_entradas_janeiro.csv"
] as const;

export const JANUARY_2026_SHA256 = "c27db8a541c7a6ca1fcc06ea3dfa785e6d382bce3b7e43f3ef06302355ef9ee6";
export const JANUARY_2026_APPLY_CONFIRMATION = "APLICAR_JANEIRO_2026";

const MANUALLY_AUTHORIZED_ATTENDANCE_ALIASES = new Map([
  [normalizePersonName("Janine da silva"), "Janine da Sillva"]
]);

export type JanuaryAttendance = {
  date: string;
  sourceName: string;
  canonicalName: string;
  attendanceType: string;
  sourceLine: number;
  matchMethod: string;
};

export type JanuaryPendingName = {
  name: string;
  count: number;
  candidates: Array<{ name: string; score: number }>;
  reason: string;
};

export type JanuaryCash = {
  id: string;
  date: string;
  value: number;
  description: string;
  competence: "2026-01";
  sourceLine: number;
  kind: "ENTRY" | "CARRY_FORWARD";
};

function sourceReader(source: string) {
  if (statSync(source).isDirectory()) {
    return { files: readdirSync(source), read: (file: string) => readFileSync(`${source}/${file}`, "utf8") };
  }
  return {
    files: execFileSync("unzip", ["-Z1", source], { encoding: "utf8" }).trim().split(/\r?\n/),
    read: (file: string) => execFileSync("unzip", ["-p", source, file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  };
}

function assertJanuaryDate(value: string, context: string) {
  const parsed = parseCivilDate(value);
  if (!value.startsWith("2026-01-") || parsed !== value) throw new Error(`${context}: data fora de janeiro/2026`);
  return parsed;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function closestStudentNames(name: string, candidates: string[], limit = 3) {
  const normalized = normalizePersonName(name);
  return candidates
    .map((candidate) => {
      const candidateNormalized = normalizePersonName(candidate);
      const distance = levenshtein(normalized, candidateNormalized);
      return { name: candidate, score: 1 - distance / Math.max(1, normalized.length, candidateNormalized.length) };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "pt-BR"))
    .slice(0, limit);
}

export function januaryCashId(row: Pick<JanuaryCash, "date" | "value" | "description" | "sourceLine">) {
  const key = `ABA_CAIXA|${row.date}|${row.value.toFixed(2)}|${normalizePersonName(row.description)}|${row.sourceLine}`;
  return `hist_caixa_2026_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

export function januaryCashEquivalenceKey(row: Pick<JanuaryCash, "date" | "value" | "description" | "competence">) {
  return `${row.date}|ENTRADA|${row.value.toFixed(2)}|${normalizePersonName(row.description)}|${row.competence}`;
}

export function parseJanuary2026Package(source: string, confirmedSha256?: string) {
  const reader = sourceReader(source);
  const sha256 = statSync(source).isDirectory() ? confirmedSha256 : createHash("sha256").update(readFileSync(source)).digest("hex");
  if (sha256 !== JANUARY_2026_SHA256) throw new Error(`SHA-256 divergente: ${sha256}`);
  for (const file of REQUIRED_FILES) if (!reader.files.includes(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);

  const manifest = JSON.parse(reader.read("manifest.json")) as {
    escopo?: { mes?: string; somente_janeiro?: boolean };
  };
  if (manifest?.escopo?.mes !== "2026-01" || manifest?.escopo?.somente_janeiro !== true) throw new Error("Manifesto fora do escopo exclusivo de janeiro/2026");

  const aliases = parseCsv(reader.read("aliases_presenca_alta_confianca.csv"));
  if (aliases.some((row) => row.confianca !== "alta" || row.regra !== "alias_validado_por_correspondencia_de_planilha")) throw new Error("Alias sem alta confiança no pacote");

  const attendanceSeen = new Set<string>();
  let attendanceInternalDuplicates = 0;
  const attendance: JanuaryAttendance[] = parseCsv(reader.read("presencas_janeiro_resolvidas.csv")).map((row, index) => {
    const date = assertJanuaryDate(row.data, `Presença resolvida linha ${index + 2}`);
    const sourceLine = Number(row.linha_fonte);
    if (!row.aluno_nome_fonte || !row.aluno_nome_canonico || row.presente !== "true" || row.horario || !row.tipo_aula || !Number.isInteger(sourceLine)) throw new Error(`Presença resolvida inválida: linha ${index + 2}`);
    const key = `${normalizePersonName(row.aluno_nome_canonico)}:${date}`;
    if (attendanceSeen.has(key)) attendanceInternalDuplicates += 1;
    attendanceSeen.add(key);
    return { date, sourceName: row.aluno_nome_fonte, canonicalName: row.aluno_nome_canonico, attendanceType: row.tipo_aula, sourceLine, matchMethod: row.metodo_match };
  });

  const pendingRows = parseCsv(reader.read("presencas_janeiro_pendentes.csv"));
  for (const [index, row] of pendingRows.entries()) {
    assertJanuaryDate(row.data, `Presença pendente linha ${index + 2}`);
    if (!row.aluno_nome_fonte || row.presente !== "true" || row.horario || row.motivo !== "nome_sem_vinculo_confiavel") throw new Error(`Presença pendente inválida: linha ${index + 2}`);
  }
  const pendingNames: JanuaryPendingName[] = parseCsv(reader.read("nomes_presenca_pendentes.csv")).map((row) => ({
    name: row.nome_fonte,
    count: Number(row.total_presencas_janeiro),
    candidates: [1, 2, 3].flatMap((index) => row[`candidato_${index}`] ? [{ name: row[`candidato_${index}`], score: Number(row[`score_${index}`]) }] : []),
    reason: row.decisao
  }));

  const cashSeen = new Set<string>();
  let cashInternalDuplicates = 0;
  const cash: JanuaryCash[] = parseCsv(reader.read("caixa_entradas_janeiro.csv")).map((row, index) => {
    const date = assertJanuaryDate(row.data, `Caixa linha ${index + 2}`);
    const value = Number(row.valor);
    const sourceLine = Number(row.linha_fonte);
    const carryForward = row.classificacao === "SALDO_TRANSPORTADO";
    if (row.tipo !== "ENTRADA" || row.competencia !== "2026-01" || !Number.isFinite(value) || value <= 0 || !Number.isInteger(sourceLine) || row.criar_pagamento !== "false" || row.alterar_mensalidade !== "false") throw new Error(`Caixa inválido: linha ${index + 2}`);
    if (carryForward !== (row.elegivel_importacao === "false") || (!carryForward && row.elegivel_importacao !== "true")) throw new Error(`Elegibilidade do Caixa inválida: linha ${index + 2}`);
    const item = { date, value, description: row.descricao, competence: "2026-01" as const, sourceLine, kind: carryForward ? "CARRY_FORWARD" as const : "ENTRY" as const };
    const id = januaryCashId(item);
    const equivalenceKey = januaryCashEquivalenceKey(item);
    if (cashSeen.has(equivalenceKey)) cashInternalDuplicates += 1;
    cashSeen.add(equivalenceKey);
    return { ...item, id };
  });

  if (attendance.length !== 1583 || pendingRows.length !== 53 || pendingNames.length !== 9 || new Set(pendingRows.map((row) => normalizePersonName(row.aluno_nome_fonte))).size !== 9) throw new Error("Totais de presença do pacote divergentes");
  if (pendingNames.reduce((sum, row) => sum + row.count, 0) !== 53) throw new Error("Resumo de pendências não totaliza 53");
  const carryForwards = cash.filter((row) => row.kind === "CARRY_FORWARD");
  const eligibleCash = cash.filter((row) => row.kind === "ENTRY");
  if (cash.length !== 157 || carryForwards.length !== 1 || carryForwards.reduce((sum, row) => sum + row.value, 0) !== 1447 || eligibleCash.length !== 156 || eligibleCash.reduce((sum, row) => sum + row.value, 0) !== 26664) throw new Error("Totais do Caixa do pacote divergentes");

  return { sha256, attendance, attendanceInternalDuplicates, pendingRowsCount: pendingRows.length, pendingNames, cash, cashInternalDuplicates };
}

type JanuaryDatabaseClient = PrismaClient | Prisma.TransactionClient;

async function prepareJanuary2026Plan(client: JanuaryDatabaseClient, pkg: ReturnType<typeof parseJanuary2026Package>) {
  const databaseRows = await client.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  const database = databaseRows[0]?.database ?? "";
  if (database !== "controle_academia") throw new Error(`Banco incorreto para o dry-run: ${database}`);

  const before = {
    attendance: await client.presenca.count(),
    cash: await client.movimentacaoCaixa.count(),
    monthlyFees: await client.mensalidade.count(),
    payments: await client.pagamento.count()
  };
  const students = await client.aluno.findMany({ select: { id: true, nomeCompleto: true } });
  const groups = new Map<string, typeof students>();
  for (const student of students) {
    const key = normalizePersonName(student.nomeCompleto);
    groups.set(key, [...(groups.get(key) ?? []), student]);
  }
  const unresolved = new Set<string>();
  const ambiguous = new Set<string>();
  const uniqueMatchedNames = new Set<string>();
  const appliedAliases = new Map<string, string>();
  const planned = pkg.attendance.flatMap((row) => {
    const aliasTarget = MANUALLY_AUTHORIZED_ATTENDANCE_ALIASES.get(normalizePersonName(row.canonicalName));
    const lookupName = aliasTarget ?? row.canonicalName;
    const key = normalizePersonName(lookupName);
    const matches = groups.get(key) ?? [];
    if (matches.length === 0) { unresolved.add(row.canonicalName); return []; }
    if (matches.length > 1) { ambiguous.add(row.canonicalName); return []; }
    if (aliasTarget) appliedAliases.set(row.canonicalName, matches[0]!.nomeCompleto);
    uniqueMatchedNames.add(key);
    return [{ ...row, alunoId: matches[0]!.id }];
  });
  const existingAttendance = await client.presenca.findMany({
    where: { data: { gte: new Date("2026-01-01T00:00:00.000Z"), lt: new Date("2026-02-01T00:00:00.000Z") } },
    select: { alunoId: true, data: true }
  });
  const existingAttendanceKeys = new Set(existingAttendance.map((row) => `${row.alunoId}:${prismaDateToCivil(row.data)}`));
  const newAttendance = planned.filter((row) => !existingAttendanceKeys.has(`${row.alunoId}:${row.date}`));

  const eligibleCash = pkg.cash.filter((row) => row.kind === "ENTRY");
  const existingCashRows = await client.movimentacaoCaixa.findMany({
    where: { competencia: "2026-01", tipo: "ENTRADA" },
    select: { id: true, data: true, valor: true, descricao: true, competencia: true }
  });
  const existingCashIds = new Set(existingCashRows.map((row) => row.id));
  const existingCashKeys = new Set(existingCashRows.map((row) => januaryCashEquivalenceKey({
    date: prismaDateToCivil(row.data),
    value: Number(row.valor),
    description: row.descricao,
    competence: row.competencia as "2026-01"
  })));
  const cashExists = (row: JanuaryCash) => existingCashIds.has(row.id) || existingCashKeys.has(januaryCashEquivalenceKey(row));
  const newCash = eligibleCash.filter((row) => !cashExists(row));
  const existingCash = eligibleCash.filter(cashExists);
  const unresolvedRows = [...unresolved].sort().map((name) => ({
    name,
    count: pkg.attendance.filter((row) => normalizePersonName(row.canonicalName) === normalizePersonName(name)).length,
    candidates: closestStudentNames(name, students.map((student) => student.nomeCompleto))
  }));
  const report = {
    database,
    before,
    after: { ...before },
    manuallyAuthorizedAliases: [...appliedAliases].map(([source, target]) => ({ source, target })),
    attendance: {
      source: pkg.attendance.length,
      uniqueStudentsMatched: uniqueMatchedNames.size,
      matchedRows: planned.length,
      existing: planned.length - newAttendance.length,
      planned: newAttendance.length,
      pending: pkg.pendingRowsCount,
      internalDuplicates: pkg.attendanceInternalDuplicates,
      unresolvedCanonicalNames: unresolvedRows,
      ambiguousCanonicalNames: [...ambiguous].sort()
    },
    pendingNames: pkg.pendingNames,
    cash: {
      source: pkg.cash.length,
      carryForwards: pkg.cash.filter((row) => row.kind === "CARRY_FORWARD").length,
      carryForwardValue: pkg.cash.filter((row) => row.kind === "CARRY_FORWARD").reduce((sum, row) => sum + row.value, 0),
      eligible: eligibleCash.length,
      eligibleValue: eligibleCash.reduce((sum, row) => sum + row.value, 0),
      existing: existingCash.length,
      existingValue: existingCash.reduce((sum, row) => sum + row.value, 0),
      planned: newCash.length,
      plannedValue: newCash.reduce((sum, row) => sum + row.value, 0),
      internalDuplicates: pkg.cashInternalDuplicates
    }
  };
  return { report, newAttendance, newCash };
}

export async function buildJanuary2026DryRun(client: JanuaryDatabaseClient, pkg: ReturnType<typeof parseJanuary2026Package>) {
  const plan = await prepareJanuary2026Plan(client, pkg);
  const after = {
    attendance: await client.presenca.count(),
    cash: await client.movimentacaoCaixa.count(),
    monthlyFees: await client.mensalidade.count(),
    payments: await client.pagamento.count()
  };
  return { ...plan.report, after };
}

export async function applyJanuary2026(
  client: PrismaClient,
  pkg: ReturnType<typeof parseJanuary2026Package>,
  confirmation: string
) {
  if (confirmation !== JANUARY_2026_APPLY_CONFIRMATION) throw new Error("Confirmação explícita do apply de janeiro ausente ou inválida");
  if (pkg.sha256 !== JANUARY_2026_SHA256) throw new Error("SHA-256 do pacote de janeiro não confirmado");
  if (pkg.attendanceInternalDuplicates || pkg.cashInternalDuplicates) throw new Error("Apply bloqueado por duplicidades internas no pacote");

  return client.$transaction(async (tx) => {
    const plan = await prepareJanuary2026Plan(tx, pkg);
    if (plan.report.attendance.unresolvedCanonicalNames.length || plan.report.attendance.ambiguousCanonicalNames.length) {
      throw new Error("Apply bloqueado por presenças sem aluno resolvido de forma explícita");
    }
    if (plan.report.attendance.matchedRows !== 1583 || plan.report.attendance.pending !== 53) {
      throw new Error("Apply bloqueado por totais de presença divergentes");
    }
    if (plan.report.cash.eligible !== 156 || plan.report.cash.eligibleValue !== 26664 || plan.report.cash.carryForwards !== 1 || plan.report.cash.carryForwardValue !== 1447) {
      throw new Error("Apply bloqueado por totais de Caixa divergentes");
    }

    const attendanceCreated = plan.newAttendance.length
      ? await tx.presenca.createMany({
          data: plan.newAttendance.map((row) => ({
            alunoId: row.alunoId,
            data: civilDateToPrisma(row.date),
            horario: null,
            tipoAula: row.attendanceType.toLowerCase(),
            presente: true,
            observacao: `Importação histórica janeiro/2026; linha fonte ${row.sourceLine}; match ${row.matchMethod}.`
          })),
          skipDuplicates: true
        })
      : { count: 0 };
    const cashCreated = plan.newCash.length
      ? await tx.movimentacaoCaixa.createMany({
          data: plan.newCash.map((row) => ({
            id: row.id,
            data: new Date(`${row.date}T12:00:00.000Z`),
            tipo: TipoMovimentacao.ENTRADA,
            descricao: row.description,
            valor: row.value,
            origemDestino: row.description,
            alunoId: null,
            formaPagamento: null,
            competencia: "2026-01",
            observacao: `Importação histórica janeiro/2026; ABA_CAIXA linha ${row.sourceLine}; não cria Pagamento nem altera Mensalidade.`
          })),
          skipDuplicates: true
        })
      : { count: 0 };

    const after = {
      attendance: await tx.presenca.count(),
      cash: await tx.movimentacaoCaixa.count(),
      monthlyFees: await tx.mensalidade.count(),
      payments: await tx.pagamento.count()
    };
    if (after.monthlyFees !== plan.report.before.monthlyFees || after.payments !== plan.report.before.payments) {
      throw new Error("Apply abortado: Mensalidade ou Pagamento foi alterado inesperadamente");
    }
    if (after.attendance !== plan.report.before.attendance + attendanceCreated.count || after.cash !== plan.report.before.cash + cashCreated.count) {
      throw new Error("Apply abortado: contagens finais inconsistentes");
    }
    return {
      ...plan.report,
      after,
      attendanceCreated: attendanceCreated.count,
      cashCreated: cashCreated.count,
      pendingIgnored: pkg.pendingRowsCount,
      carryForwardsIgnored: plan.report.cash.carryForwards,
      createdCashValue: plan.newCash.reduce((sum, row) => sum + row.value, 0)
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000, maxWait: 10000 });
}
