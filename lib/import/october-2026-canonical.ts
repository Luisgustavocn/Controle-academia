import * as XLSX from "xlsx";
import { normalizePersonName } from "@/lib/import/october-2026";

export const CANONICAL_PRICE_RULE = "DEFAULT_MODALITY_PRICE_WITH_STUDENT_OVERRIDE";

export type CanonicalModality = { name: string; action: string; defaultValue: number | null; defaultOrigin: string; students: number };
export type CanonicalStudent = {
  sourceName: string; name: string; phone: string; status: "ATIVO" | "INATIVO"; modality: string;
  dueDay: number; monthlyValue: number | null; useDefault: boolean; startDate: string | null; startOrigin: string; firstPaidMonth: string;
};
export type CanonicalPeriod = {
  student: string; startDate: string | null; startOrigin: string; exitDate: string | null; open: boolean;
  modality: string; monthlyValue: number | null; useDefault: boolean; dueDay: number;
};
export type CanonicalAttendance = { student: string; date: string; time: string | null; present: boolean; sourceName: string };
export type CanonicalAlias = { alias: string; canonicalName: string; context: string };
export type CanonicalPackage = {
  students: CanonicalStudent[]; modalities: CanonicalModality[]; periods: CanonicalPeriod[];
  attendance: CanonicalAttendance[]; aliases: CanonicalAlias[]; issues: string[];
  summary: { useDefault: number; overrides: number; withoutValue: number; periodUseDefault: number; periodOverrides: number; periodWithoutValue: number };
};

function text(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function nullableNumber(value: unknown) { return value === null || value === undefined || value === "" ? null : Number(value); }
function yes(value: unknown) { return text(value).toUpperCase() === "SIM"; }
function date(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : "INVALID";
}
function rows(workbook: XLSX.WorkBook, sheet: string) {
  if (!workbook.Sheets[sheet]) throw new Error(`Aba canônica ausente: ${sheet}`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet], { defval: null, raw: true });
}
function duplicates(values: string[]) {
  const seen = new Set<string>(); const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    else seen.add(value);
  }
  return repeated;
}

export function parseCanonicalOctoberWorkbook(workbook: XLSX.WorkBook): CanonicalPackage {
  const modalityRows = rows(workbook, "Modalidades");
  const studentRows = rows(workbook, "Alunos");
  const periodRows = rows(workbook, "Periodos_Matricula");
  const attendanceRows = rows(workbook, "Presencas");
  const aliasRows = rows(workbook, "Aliases");
  const issues: string[] = [];
  const modalities: CanonicalModality[] = modalityRows.map((row) => ({
    name: text(row["Modalidade Final"]), action: text(row.Acao), defaultValue: nullableNumber(row["Valor Padrao"]),
    defaultOrigin: text(row["Origem Valor Padrao"]), students: Number(row["Qtd Alunos"])
  }));
  const students: CanonicalStudent[] = studentRows.map((row) => ({
    sourceName: text(row["Nome Fonte"]), name: text(row["Nome Canonico"]), phone: text(row.Telefone),
    status: text(row["Status Outubro"]) as CanonicalStudent["status"], modality: text(row["Modalidade Final"]),
    dueDay: Number(row["Dia Vencimento"]), monthlyValue: nullableNumber(row["Valor Mensal"]),
    useDefault: yes(row["Usar Valor Padrao"]), startDate: date(row["Data Inicio Inferida"]),
    startOrigin: text(row["Origem Data Inicio"]), firstPaidMonth: text(row["Primeiro Mes Pago"])
  }));
  const periods: CanonicalPeriod[] = periodRows.map((row) => ({
    student: text(row.Aluno), startDate: date(row["Data Inicio"]), startOrigin: text(row["Origem Data Inicio"]),
    exitDate: date(row["Data Saida"]), open: yes(row["Periodo Aberto"]), modality: text(row.Modalidade),
    monthlyValue: nullableNumber(row["Valor Mensal"]), useDefault: yes(row["Usar Valor Padrao"]), dueDay: Number(row["Dia Vencimento"])
  }));
  const attendance: CanonicalAttendance[] = attendanceRows.map((row) => ({
    student: text(row.Aluno), date: date(row.Data) ?? "INVALID", time: text(row.Horario) || null, present: yes(row.Presente),
    sourceName: text(row["Nome Fonte Frequencia"])
  }));
  const aliases: CanonicalAlias[] = aliasRows.map((row) => ({
    alias: text(row.Alias), canonicalName: text(row["Nome Canonico"]), context: text(row.Contexto)
  }));
  const modalityByName = new Map(modalities.map((item) => [normalizePersonName(item.name), item]));
  const studentByName = new Map(students.map((item) => [normalizePersonName(item.name), item]));
  const periodByStudent = new Map(periods.map((item) => [normalizePersonName(item.student), item]));

  if (students.length !== 289) issues.push(`Alunos: esperado 289, encontrado ${students.length}`);
  if (modalities.length !== 22) issues.push(`Modalidades: esperado 22, encontrado ${modalities.length}`);
  if (periods.length !== 200) issues.push(`Períodos: esperado 200, encontrado ${periods.length}`);
  if (attendance.length !== 55) issues.push(`Presenças: esperado 55, encontrado ${attendance.length}`);
  if (aliases.length !== 4) issues.push(`Aliases: esperado 4, encontrado ${aliases.length}`);
  for (const name of duplicates(students.map((item) => normalizePersonName(item.name)))) issues.push(`Aluno canônico duplicado: ${name}`);
  for (const name of duplicates(modalities.map((item) => normalizePersonName(item.name)))) issues.push(`Modalidade canônica duplicada: ${name}`);
  for (const name of duplicates(periods.map((item) => normalizePersonName(item.student)))) issues.push(`Período duplicado: ${name}`);
  for (const key of duplicates(attendance.map((item) => `${normalizePersonName(item.student)}:${item.date}`))) issues.push(`Presença duplicada: ${key}`);

  for (const student of students) {
    const modality = modalityByName.get(normalizePersonName(student.modality));
    if (!student.name || !modality) issues.push(`${student.name || "Aluno sem nome"}: modalidade inválida`);
    if (!Number.isInteger(student.dueDay) || student.dueDay < 1 || student.dueDay > 31) issues.push(`${student.name}: vencimento inválido`);
    if (!['ATIVO', 'INATIVO'].includes(student.status)) issues.push(`${student.name}: status inválido`);
    if (student.startDate === "INVALID") issues.push(`${student.name}: data de início inválida`);
    if (student.startOrigin === "DESCONHECIDA" && student.startDate !== null) issues.push(`${student.name}: origem desconhecida não pode possuir data`);
    if (student.startOrigin === "INFERIDA_PRIMEIRO_PAGAMENTO" && student.startDate) {
      const month = new Map([["Jan",1],["Fev",2],["Mar",3],["Abr",4],["Mai",5],["Jun",6],["Jul",7],["Ago",8],["Set",9],["Out",10]]).get(student.firstPaidMonth);
      if (!month) issues.push(`${student.name}: primeiro mês pago inválido`);
      else {
        const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
        const expected = `2026-${String(month).padStart(2,"0")}-${String(Math.min(student.dueDay,lastDay)).padStart(2,"0")}`;
        if (student.startDate !== expected) issues.push(`${student.name}: início não corresponde ao primeiro mês pago + vencimento`);
      }
    }
    if (student.useDefault && (student.monthlyValue !== null || modality?.defaultValue === null)) issues.push(`${student.name}: configuração de preço padrão inválida`);
    if (!student.useDefault && student.monthlyValue !== null && student.monthlyValue === modality?.defaultValue) issues.push(`${student.name}: override redundante igual ao padrão`);
  }
  for (const period of periods) {
    const student = studentByName.get(normalizePersonName(period.student));
    const modality = modalityByName.get(normalizePersonName(period.modality));
    if (!student || student.status !== "ATIVO") issues.push(`${period.student}: período sem aluno ativo`);
    if (!period.open || period.exitDate !== null) issues.push(`${period.student}: período canônico deve estar aberto`);
    if (period.startDate === "INVALID") issues.push(`${period.student}: data do período inválida`);
    if (!modality || student?.modality !== period.modality || student?.monthlyValue !== period.monthlyValue || student?.useDefault !== period.useDefault || student?.dueDay !== period.dueDay) issues.push(`${period.student}: período diverge do cadastro`);
  }
  for (const student of students) {
    const hasPeriod = periodByStudent.has(normalizePersonName(student.name));
    if ((student.status === "ATIVO") !== hasPeriod) issues.push(`${student.name}: status e período divergem`);
  }
  for (const item of attendance) {
    const student = studentByName.get(normalizePersonName(item.student));
    const period = periodByStudent.get(normalizePersonName(item.student));
    if (!student || !period) issues.push(`${item.student}: presença sem vínculo`);
    if (item.time !== null || !item.present) issues.push(`${item.student}: presença deve ser verdadeira e sem horário inventado`);
    if (item.date === "INVALID" || item.date < "2026-10-01" || item.date > "2026-10-31") issues.push(`${item.student}: data de presença inválida`);
    if (period && ((period.startDate && item.date < period.startDate) || (period.exitDate && item.date > period.exitDate))) issues.push(`${item.student}: presença fora do período`);
  }
  const approved = new Map([
    ["3x musculacao", 100], ["todos os dias", 110], ["2x personal", 290], ["3x personal", 350]
  ]);
  for (const [name, value] of approved) if (modalityByName.get(name)?.defaultValue !== value) issues.push(`${name}: preço aprovado divergente`);
  const requiredUnknown = ["diego roberto dos santos", "luis henrique arruda da silva", "elisiane de fatima cuchinski"];
  for (const name of requiredUnknown) {
    const student = studentByName.get(name);
    if (!student || student.monthlyValue !== null || student.useDefault) issues.push(`${name}: valor desconhecido configurado incorretamente`);
  }
  if (studentByName.get("marileia da silva")?.status !== "ATIVO") issues.push("Marileia da Silva deve permanecer ATIVA");
  const requiredAliases = new Map([["adelar de cezaro","adelar decezaro"],["andressa da rosa","andressa de souza rosa"],["javier gonzalez","javier gonsalez"],["kevin picoli","kevin picolli"]]);
  const aliasMap = new Map(aliases.map((item)=>[normalizePersonName(item.alias),normalizePersonName(item.canonicalName)]));
  for (const [alias, canonical] of requiredAliases) if (aliasMap.get(alias)!==canonical) issues.push(`${alias}: alias aprovado ausente ou divergente`);
  if (students.filter((item)=>item.status==="ATIVO").length!==200 || students.filter((item)=>item.status==="INATIVO").length!==89) issues.push("Contagem final de status divergente");
  const summary = {
    useDefault: students.filter((item) => item.useDefault).length,
    overrides: students.filter((item) => !item.useDefault && item.monthlyValue !== null).length,
    withoutValue: students.filter((item) => !item.useDefault && item.monthlyValue === null).length,
    periodUseDefault: periods.filter((item) => item.useDefault).length,
    periodOverrides: periods.filter((item) => !item.useDefault && item.monthlyValue !== null).length,
    periodWithoutValue: periods.filter((item) => !item.useDefault && item.monthlyValue === null).length
  };
  return { students, modalities, periods, attendance, aliases, issues: [...new Set(issues)], summary };
}
