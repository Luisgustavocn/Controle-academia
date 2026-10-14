import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { Prisma, TipoMovimentacao, type PrismaClient } from "@prisma/client";
import { civilDateToPrisma, parseCivilDate, prismaDateToCivil } from "@/lib/attendance-date";
import { parseCsv } from "@/lib/import/financial-history-2026";
import { normalizePersonName } from "@/lib/import/october-2026";

export const OCTOBER_THROUGH_13_2026_SHA256 = "a3f911cba8866637dd9bb458c5bf96e37a63874328199da3eb517cb7f352c135";
export const OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION = "APLICAR_OUTUBRO_ATE_13_2026";
const START = "2026-10-01";
const END = "2026-10-13";
const REQUIRED = ["manifest.json", "presencas_outubro_ate_13_resolvidas.csv", "presencas_outubro_ate_13_pendentes.csv", "aliases_presenca_alta_confianca.csv", "nomes_presenca_pendentes.csv", "caixa_entradas_outubro_ate_13.csv"];
const AUTHORIZED_ALIASES = new Map([
  [normalizePersonName("Elisiane Fatima Cuchinski"), "Elisiane de Fatima Cuchinski"],
  [normalizePersonName("Janine da silva"), "Janine da Sillva"]
]);

type Attendance = { date: string; sourceName: string; canonicalName: string; sourceLine: number; matchMethod: string };
type Cash = { id: string; date: string; value: number; description: string; competence: "2026-10"; sourceLine: number; kind: "ENTRY" | "CARRY_FORWARD" };
type Db = PrismaClient | Prisma.TransactionClient;

function reader(source: string) {
  if (statSync(source).isDirectory()) return { files: readdirSync(source), read: (file: string) => readFileSync(`${source}/${file}`, "utf8") };
  return { files: execFileSync("unzip", ["-Z1", source], { encoding: "utf8" }).trim().split(/\r?\n/), read: (file: string) => execFileSync("unzip", ["-p", source, file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }) };
}

function date(value: string, context: string) {
  if (parseCivilDate(value) !== value || value < START || value > END) throw new Error(`${context}: data fora de 01/10/2026 a 13/10/2026`);
  return value;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function candidates(name: string, names: string[]) {
  const normalized = normalizePersonName(name);
  return names.map((candidate) => { const other = normalizePersonName(candidate); return { name: candidate, score: Number((1 - levenshtein(normalized, other) / Math.max(1, normalized.length, other.length)).toFixed(3)) }; })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR")).slice(0, 3);
}

export function octoberCashId(row: Pick<Cash, "date" | "value" | "description" | "sourceLine">) {
  const key = `ABA_CAIXA|${row.date}|${row.value.toFixed(2)}|${normalizePersonName(row.description)}|${row.sourceLine}`;
  return `hist_caixa_2026_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

export function octoberCashKey(row: Pick<Cash, "date" | "value" | "description" | "competence">) {
  return `${row.date}|ENTRADA|${row.value.toFixed(2)}|${normalizePersonName(row.description)}|${row.competence}`;
}

export function parseOctoberThrough13Package(source: string, confirmedSha256?: string) {
  const input = reader(source);
  const sha256 = statSync(source).isDirectory() ? confirmedSha256 : createHash("sha256").update(readFileSync(source)).digest("hex");
  if (sha256 !== OCTOBER_THROUGH_13_2026_SHA256) throw new Error(`SHA-256 divergente: ${sha256}`);
  for (const file of REQUIRED) if (!input.files.includes(file)) throw new Error(`Arquivo obrigatório ausente: ${file}`);
  const manifest = JSON.parse(input.read("manifest.json"));
  if (manifest?.escopo?.inicio !== START || manifest?.escopo?.fim !== END || manifest?.escopo?.inclui_gastos_despesas !== false) throw new Error("Manifesto fora do escopo autorizado");

  const aliases = parseCsv(input.read("aliases_presenca_alta_confianca.csv"));
  if (aliases.some((row) => row.confianca !== "alta" || row.regra !== "alias_de_grafia_da_planilha")) throw new Error("Alias não auditável no pacote");
  const aliasMap = new Map(aliases.map((row) => [normalizePersonName(row.nome_fonte), row.nome_canonico]));
  const attendanceSeen = new Set<string>(); let attendanceInternalDuplicates = 0;
  const attendance: Attendance[] = parseCsv(input.read("presencas_outubro_ate_13_resolvidas.csv")).map((row, index) => {
    const day = date(row.data, `Presença resolvida linha ${index + 2}`); const sourceLine = Number(row.linha_fonte);
    const authorizedAlias = aliasMap.get(normalizePersonName(row.aluno_nome_fonte));
    if (!row.aluno_nome_fonte || !row.aluno_nome_canonico || row.presente !== "true" || row.horario || !Number.isInteger(sourceLine)) throw new Error(`Presença resolvida inválida: linha ${index + 2}`);
    if (row.metodo_match === "alias_alta_confianca" && normalizePersonName(authorizedAlias ?? "") !== normalizePersonName(row.aluno_nome_canonico)) throw new Error(`Alias não validado: linha ${index + 2}`);
    const key = `${normalizePersonName(row.aluno_nome_canonico)}:${day}`; if (attendanceSeen.has(key)) attendanceInternalDuplicates += 1; attendanceSeen.add(key);
    return { date: day, sourceName: row.aluno_nome_fonte, canonicalName: row.aluno_nome_canonico, sourceLine, matchMethod: row.metodo_match };
  });
  const pendingRows = parseCsv(input.read("presencas_outubro_ate_13_pendentes.csv"));
  pendingRows.forEach((row, index) => { date(row.data, `Presença pendente linha ${index + 2}`); if (!row.aluno_nome_fonte || row.presente !== "true" || row.horario || row.motivo !== "nome_sem_vinculo_confiavel") throw new Error(`Presença pendente inválida: linha ${index + 2}`); });
  const pendingNames = parseCsv(input.read("nomes_presenca_pendentes.csv")).map((row) => ({ name: row.nome_fonte, count: Number(row.total_presencas_outubro_ate_13), candidates: [1, 2, 3].flatMap((i) => row[`candidato_${i}`] ? [{ name: row[`candidato_${i}`], score: Number(row[`score_${i}`]) }] : []), reason: row.decisao }));

  const cashSeen = new Set<string>(); let cashInternalDuplicates = 0;
  const cash: Cash[] = parseCsv(input.read("caixa_entradas_outubro_ate_13.csv")).map((row, index) => {
    const day = date(row.data, `Caixa linha ${index + 2}`); const value = Number(row.valor); const sourceLine = Number(row.linha_fonte); const carry = row.classificacao === "SALDO_TRANSPORTADO";
    if (row.tipo !== "ENTRADA" || row.competencia !== "2026-10" || !Number.isFinite(value) || value <= 0 || !Number.isInteger(sourceLine) || row.criar_pagamento !== "false" || row.alterar_mensalidade !== "false") throw new Error(`Caixa inválido: linha ${index + 2}`);
    if ((carry && row.elegivel_importacao !== "false") || (!carry && row.elegivel_importacao !== "true")) throw new Error(`Elegibilidade inválida: linha ${index + 2}`);
    const item = { date: day, value, description: row.descricao, competence: "2026-10" as const, sourceLine, kind: carry ? "CARRY_FORWARD" as const : "ENTRY" as const };
    const key = octoberCashKey(item); if (cashSeen.has(key)) cashInternalDuplicates += 1; cashSeen.add(key); return { ...item, id: octoberCashId(item) };
  });

  if (attendance.length !== 386 || pendingRows.length !== 28 || pendingNames.length !== 11 || attendance.length + pendingRows.length !== 414 || new Set(pendingRows.map((row) => normalizePersonName(row.aluno_nome_fonte))).size !== 11 || pendingNames.reduce((sum, row) => sum + row.count, 0) !== 28) throw new Error("Totais de presença divergentes");
  const carry = cash.filter((row) => row.kind === "CARRY_FORWARD"); const eligible = cash.filter((row) => row.kind === "ENTRY");
  if (cash.length !== 82 || carry.length !== 1 || carry.reduce((sum, row) => sum + row.value, 0) !== 1078 || eligible.length !== 81 || eligible.reduce((sum, row) => sum + row.value, 0) !== 16720) throw new Error("Totais do Caixa divergentes");
  return { sha256, attendance, pendingRowsCount: pendingRows.length, pendingNames, cash, attendanceInternalDuplicates, cashInternalDuplicates };
}

async function prepareOctoberThrough13Plan(client: Db, pkg: ReturnType<typeof parseOctoberThrough13Package>) {
  const database = (await client.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`)[0]?.database ?? "";
  if (database !== "controle_academia") throw new Error(`Banco incorreto para o dry-run: ${database}`);
  const before = { attendance: await client.presenca.count(), cash: await client.movimentacaoCaixa.count(), monthlyFees: await client.mensalidade.count(), payments: await client.pagamento.count(), students: await client.aluno.count(), enrollmentPeriods: await client.periodoMatricula.count() };
  const students = await client.aluno.findMany({ select: { id: true, nomeCompleto: true } }); const groups = new Map<string, typeof students>();
  for (const student of students) { const key = normalizePersonName(student.nomeCompleto); groups.set(key, [...(groups.get(key) ?? []), student]); }
  const unresolved = new Set<string>(); const ambiguous = new Set<string>(); const matchedNames = new Set<string>();
  const appliedAliases = new Map<string, string>();
  const resolved = pkg.attendance.flatMap((row) => { const alias = AUTHORIZED_ALIASES.get(normalizePersonName(row.canonicalName)); const lookup = alias ?? row.canonicalName; const key = normalizePersonName(lookup); const matches = groups.get(key) ?? []; if (!matches.length) { unresolved.add(row.canonicalName); return []; } if (matches.length > 1) { ambiguous.add(row.canonicalName); return []; } if (alias) appliedAliases.set(row.canonicalName, matches[0]!.nomeCompleto); matchedNames.add(key); return [{ ...row, alunoId: matches[0]!.id }]; });
  const existingPresence = await client.presenca.findMany({ where: { data: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-10-14T00:00:00.000Z") } }, select: { alunoId: true, data: true } });
  const presenceKeys = new Set(existingPresence.map((row) => `${row.alunoId}:${prismaDateToCivil(row.data)}`)); const newPresence = resolved.filter((row) => !presenceKeys.has(`${row.alunoId}:${row.date}`));
  const eligible = pkg.cash.filter((row) => row.kind === "ENTRY"); const existingCashRows = await client.movimentacaoCaixa.findMany({ where: { competencia: "2026-10", tipo: "ENTRADA" }, select: { id: true, data: true, valor: true, descricao: true, competencia: true } });
  const ids = new Set(existingCashRows.map((row) => row.id)); const keys = new Set(existingCashRows.map((row) => octoberCashKey({ date: prismaDateToCivil(row.data), value: Number(row.valor), description: row.descricao, competence: "2026-10" })));
  const exists = (row: Cash) => ids.has(row.id) || keys.has(octoberCashKey(row)); const existingCash = eligible.filter(exists); const newCash = eligible.filter((row) => !exists(row));
  const additional = [...unresolved].map((name) => ({ name, count: pkg.attendance.filter((row) => normalizePersonName(row.canonicalName) === normalizePersonName(name)).length, reason: "SEM_MATCH_EXATO_NO_BANCO", candidates: candidates(name, students.map((student) => student.nomeCompleto)) }));
  const after = { attendance: await client.presenca.count(), cash: await client.movimentacaoCaixa.count(), monthlyFees: await client.mensalidade.count(), payments: await client.pagamento.count(), students: await client.aluno.count(), enrollmentPeriods: await client.periodoMatricula.count() };
  const report = { database, before, after, authorizedAliases: [...appliedAliases].map(([source, target]) => ({ source, target, count: pkg.attendance.filter((row) => normalizePersonName(row.canonicalName) === normalizePersonName(source)).length })), attendance: { total: pkg.attendance.length + pkg.pendingRowsCount, packageResolved: pkg.attendance.length, exactlyResolved: resolved.length, uniqueStudentsMatched: matchedNames.size, existing: resolved.length - newPresence.length, planned: newPresence.length, originalPending: pkg.pendingRowsCount, additionalPending: additional, ambiguous: [...ambiguous], internalDuplicates: pkg.attendanceInternalDuplicates }, pendingNames: pkg.pendingNames, cash: { source: pkg.cash.length, carryForwards: pkg.cash.length - eligible.length, carryForwardValue: pkg.cash.filter((row) => row.kind === "CARRY_FORWARD").reduce((sum, row) => sum + row.value, 0), eligible: eligible.length, eligibleValue: eligible.reduce((sum, row) => sum + row.value, 0), existing: existingCash.length, existingValue: existingCash.reduce((sum, row) => sum + row.value, 0), planned: newCash.length, plannedValue: newCash.reduce((sum, row) => sum + row.value, 0), internalDuplicates: pkg.cashInternalDuplicates } };
  return { report, newPresence, newCash };
}

export async function buildOctoberThrough13DryRun(client: Db, pkg: ReturnType<typeof parseOctoberThrough13Package>) {
  return (await prepareOctoberThrough13Plan(client, pkg)).report;
}

export async function applyOctoberThrough13(client: PrismaClient, pkg: ReturnType<typeof parseOctoberThrough13Package>, confirmation: string) {
  if (confirmation !== OCTOBER_THROUGH_13_2026_APPLY_CONFIRMATION) throw new Error("Confirmação explícita do apply ausente ou inválida");
  if (pkg.sha256 !== OCTOBER_THROUGH_13_2026_SHA256) throw new Error("SHA-256 do pacote não confirmado");
  if (pkg.attendanceInternalDuplicates || pkg.cashInternalDuplicates) throw new Error("Apply bloqueado por duplicidades internas");
  return client.$transaction(async (tx) => {
    const plan = await prepareOctoberThrough13Plan(tx, pkg);
    if (plan.report.attendance.exactlyResolved !== 383 || plan.report.attendance.originalPending !== 28 || plan.report.attendance.additionalPending.reduce((sum, row) => sum + row.count, 0) !== 3 || plan.report.attendance.ambiguous.length) throw new Error("Apply bloqueado por resolução de presenças divergente");
    if (plan.report.cash.eligible !== 81 || plan.report.cash.eligibleValue !== 16720 || plan.report.cash.carryForwards !== 1 || plan.report.cash.carryForwardValue !== 1078) throw new Error("Apply bloqueado por totais de Caixa divergentes");
    const attendanceCreated = plan.newPresence.length ? await tx.presenca.createMany({ data: plan.newPresence.map((row) => ({ alunoId: row.alunoId, data: civilDateToPrisma(row.date), horario: null, tipoAula: "musculacao", presente: true, observacao: `Importação histórica outubro/2026 até 13/10; linha fonte ${row.sourceLine}; match ${row.matchMethod}.` })), skipDuplicates: true }) : { count: 0 };
    const cashCreated = plan.newCash.length ? await tx.movimentacaoCaixa.createMany({ data: plan.newCash.map((row) => ({ id: row.id, data: new Date(`${row.date}T12:00:00.000Z`), tipo: TipoMovimentacao.ENTRADA, descricao: row.description, valor: row.value, origemDestino: row.description, alunoId: null, formaPagamento: null, competencia: "2026-10", observacao: `Importação histórica outubro/2026 até 13/10; ABA_CAIXA linha ${row.sourceLine}; não cria Pagamento nem altera Mensalidade.` })), skipDuplicates: true }) : { count: 0 };
    const after = { attendance: await tx.presenca.count(), cash: await tx.movimentacaoCaixa.count(), monthlyFees: await tx.mensalidade.count(), payments: await tx.pagamento.count(), students: await tx.aluno.count(), enrollmentPeriods: await tx.periodoMatricula.count() };
    if (after.monthlyFees !== plan.report.before.monthlyFees || after.payments !== plan.report.before.payments || after.students !== plan.report.before.students || after.enrollmentPeriods !== plan.report.before.enrollmentPeriods) throw new Error("Apply abortado: entidade fora do escopo foi alterada");
    if (after.attendance !== plan.report.before.attendance + attendanceCreated.count || after.cash !== plan.report.before.cash + cashCreated.count) throw new Error("Apply abortado: contagens finais inconsistentes");
    return { ...plan.report, after, attendanceCreated: attendanceCreated.count, cashCreated: cashCreated.count, cashCreatedValue: plan.newCash.reduce((sum, row) => sum + row.value, 0), pendingIgnored: 31, carryForwardsIgnored: 1 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000, maxWait: 10000 });
}
