import * as XLSX from "xlsx";

export const OCTOBER_2026_START = "2026-10-01";
export const OCTOBER_2026_END_EXCLUSIVE = "2026-11-01";

const EXPECTED = {
  students: 289,
  active: 199,
  inactive: 89,
  notEnrolled: 1,
  attendance: 55,
  activeWithoutMonthlyValue: 3
} as const;

export type SourceStudentStatus = "ACTIVE" | "INACTIVE" | "NOT_ENROLLED";
export type ProductionMatch = "EXISTENTE_EXATO" | "EXISTENTE_PROVAVEL" | "NOVO" | "AMBIGUO";
export type PlannedAction = "CRIAR" | "ATUALIZAR" | "PULAR" | "REVISAR";

export type ImportIssue = {
  code: string;
  message: string;
  blocking: boolean;
  sourceRow?: number;
};

export type OctoberSourceStudent = {
  sourceRow: number;
  name: string;
  normalizedName: string;
  phone: string | null;
  normalizedPhone: string | null;
  sourceModality: string;
  modalityKey: string;
  dueDay: number;
  status: SourceStudentStatus;
  monthlyValue: number | null;
  attendanceDates: string[];
};

export type UnmatchedAttendanceRow = {
  sourceRow: number;
  name: string;
  normalizedName: string;
  dates: string[];
  suggestions: string[];
};

export type ParsedOctoberWorkbook = {
  students: OctoberSourceStudent[];
  sourceAttendanceCount: number;
  unmatchedAttendanceRows: UnmatchedAttendanceRow[];
  modalityLabels: Map<string, Set<string>>;
  issues: ImportIssue[];
};

export type ExistingStudentSnapshot = {
  id: string;
  name: string;
  phone: string;
  dueDay: number;
  status: string;
  modalityId: string | null;
  modalityName: string | null;
};

export type ExistingModalitySnapshot = {
  id: string;
  name: string;
  defaultValue: number;
  active: boolean;
};

export type ExistingAttendanceSnapshot = {
  studentId: string;
  date: string;
};

export type ProductionSnapshot = {
  students: ExistingStudentSnapshot[];
  modalities: ExistingModalitySnapshot[];
  attendance: ExistingAttendanceSnapshot[];
};

export type StudentDryRunRow = OctoberSourceStudent & {
  match: ProductionMatch;
  matchedStudentId: string | null;
  matchedStudentName: string | null;
  action: PlannedAction;
  existingAttendance: number;
  newAttendance: number;
  observation: string;
};

export type ModalityDryRunRow = {
  key: string;
  sourceLabels: string[];
  sourceStudents: number;
  sourceValues: number[];
  existingName: string | null;
  action: "REUTILIZAR" | "CRIAR" | "REVISAR";
  observation: string;
};

export type OctoberDryRunSummary = {
  sourceStudents: number;
  exactMatches: number;
  probableMatches: number;
  newStudents: number;
  ambiguousStudents: number;
  active: number;
  inactive: number;
  notEnrolled: number;
  withoutMonthlyValue: number;
  modalitiesFound: number;
  sourceAttendance: number;
  existingAttendance: number;
  newAttendance: number;
  duplicatesPrevented: number;
  errors: number;
  blockers: number;
};

export type OctoberDryRunPlan = {
  summary: OctoberDryRunSummary;
  students: StudentDryRunRow[];
  modalities: ModalityDryRunRow[];
  unmatchedAttendanceRows: UnmatchedAttendanceRow[];
  issues: ImportIssue[];
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizePersonName(value: unknown) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeModalityKey(value: unknown) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function cellAt(sheet: XLSX.WorkSheet, row: number, column: number) {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })];
}

function cellText(sheet: XLSX.WorkSheet, row: number, column: number) {
  const cell = cellAt(sheet, row, column);
  return cleanText(cell?.w ?? cell?.v);
}

function fillColor(cell: XLSX.CellObject | undefined) {
  const style = cell?.s as { fgColor?: { rgb?: string; theme?: number; tint?: number } } | undefined;
  const color = style?.fgColor;
  if (color?.rgb) return color.rgb.replace(/^FF(?=[0-9A-F]{6}$)/i, "").toUpperCase();
  if (color?.theme !== undefined) return `theme:${color.theme}:tint:${color.tint ?? 0}`;
  return "none";
}

function statusFromCell(cell: XLSX.CellObject | undefined): SourceStudentStatus | null {
  const color = fillColor(cell);
  if (color === "FF0000") return "INACTIVE";
  if (color === "C0C0C0") return "NOT_ENROLLED";
  if (color === "BFBFBF" || color.startsWith("theme:0:tint:-0.249")) return "ACTIVE";
  return null;
}

function latestKnownMonthlyValue(sheet: XLSX.WorkSheet, row: number) {
  let value: number | null = null;
  // E:N represents January through October. November and December are deliberately excluded.
  for (let column = 4; column <= 13; column += 1) {
    const raw = cellAt(sheet, row, column)?.v;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) value = raw;
  }
  return value;
}

function levenshtein(left: string, right: string) {
  const matrix = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= right.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
  }
  return matrix[left.length][right.length];
}

function closestNames(name: string, candidates: string[], limit = 3) {
  const normalized = normalizePersonName(name);
  return candidates
    .map((candidate) => {
      const candidateNormalized = normalizePersonName(candidate);
      const distance = levenshtein(normalized, candidateNormalized);
      return { candidate, ratio: distance / Math.max(1, normalized.length, candidateNormalized.length) };
    })
    .sort((left, right) => left.ratio - right.ratio)
    .slice(0, limit);
}

function countByStatus(students: OctoberSourceStudent[], status: SourceStudentStatus) {
  return students.filter((student) => student.status === status).length;
}

function sanityIssues(students: OctoberSourceStudent[], attendanceCount: number): ImportIssue[] {
  const actual = {
    students: students.length,
    active: countByStatus(students, "ACTIVE"),
    inactive: countByStatus(students, "INACTIVE"),
    notEnrolled: countByStatus(students, "NOT_ENROLLED"),
    attendance: attendanceCount,
    activeWithoutMonthlyValue: students.filter((student) => student.status === "ACTIVE" && student.monthlyValue === null).length
  };
  const issues: ImportIssue[] = [];
  for (const key of Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>) {
    if (actual[key] !== EXPECTED[key]) {
      issues.push({
        code: `SANITY_${key.toUpperCase()}`,
        message: `Contagem ${key}: esperado ${EXPECTED[key]}, encontrado ${actual[key]}`,
        blocking: true
      });
    }
  }
  return issues;
}

export function parseOctober2026Workbook(workbook: XLSX.WorkBook): ParsedOctoberWorkbook {
  const studentsSheet = workbook.Sheets.Musc;
  const attendanceSheet = workbook.Sheets.Out;
  if (!studentsSheet || !attendanceSheet) {
    throw new Error("A planilha precisa conter as abas Musc e Out");
  }

  const issues: ImportIssue[] = [];
  const students: OctoberSourceStudent[] = [];
  const modalityLabels = new Map<string, Set<string>>();
  const names = new Map<string, OctoberSourceStudent[]>();

  for (let row = 4; row <= 303; row += 1) {
    const name = cellText(studentsSheet, row, 0);
    if (!name) continue;
    const nameCell = cellAt(studentsSheet, row, 0);
    const status = statusFromCell(nameCell);
    const sourceModality = cellText(studentsSheet, row, 2);
    const modalityKey = normalizeModalityKey(sourceModality);
    const dueDay = Number(cellAt(studentsSheet, row, 3)?.v);
    const phone = normalizePhone(cellAt(studentsSheet, row, 1)?.v);

    if (!status) {
      issues.push({ code: "UNKNOWN_STATUS_COLOR", message: `Cor de status não reconhecida na linha ${row}: ${fillColor(nameCell)}`, blocking: true, sourceRow: row });
    }
    if (!sourceModality) {
      issues.push({ code: "MISSING_MODALITY", message: `Modalidade ausente na linha ${row}`, blocking: true, sourceRow: row });
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      issues.push({ code: "INVALID_DUE_DAY", message: `Vencimento inválido na linha ${row}`, blocking: true, sourceRow: row });
    }

    const student: OctoberSourceStudent = {
      sourceRow: row,
      name,
      normalizedName: normalizePersonName(name),
      phone,
      normalizedPhone: phone,
      sourceModality,
      modalityKey,
      dueDay,
      status: status ?? "INACTIVE",
      monthlyValue: latestKnownMonthlyValue(studentsSheet, row),
      attendanceDates: []
    };
    students.push(student);
    const duplicateGroup = names.get(student.normalizedName) ?? [];
    duplicateGroup.push(student);
    names.set(student.normalizedName, duplicateGroup);
    const labels = modalityLabels.get(modalityKey) ?? new Set<string>();
    labels.add(sourceModality);
    modalityLabels.set(modalityKey, labels);
  }

  for (const duplicateGroup of names.values()) {
    if (duplicateGroup.length > 1) {
      issues.push({ code: "DUPLICATE_SOURCE_STUDENT", message: `Nome duplicado na fonte: ${duplicateGroup[0].name}`, blocking: true, sourceRow: duplicateGroup[0].sourceRow });
    }
  }

  const dayColumns: Array<{ column: number; day: number }> = [];
  for (let column = 2; column <= 28; column += 1) {
    const day = Number(cellAt(attendanceSheet, 4, column)?.v);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      issues.push({ code: "INVALID_ATTENDANCE_DAY", message: `Dia inválido no cabeçalho da aba Out, coluna ${XLSX.utils.encode_col(column)}`, blocking: true });
      continue;
    }
    dayColumns.push({ column, day });
  }

  let sourceAttendanceCount = 0;
  const unmatchedAttendanceRows: UnmatchedAttendanceRow[] = [];
  for (let row = 5; row <= 196; row += 1) {
    const name = cellText(attendanceSheet, row, 1);
    if (!name) continue;
    const dates = dayColumns
      .filter(({ column }) => String(cellAt(attendanceSheet, row, column)?.v ?? "").trim() === "1")
      .map(({ day }) => `2026-10-${String(day).padStart(2, "0")}`);
    sourceAttendanceCount += dates.length;
    const matches = names.get(normalizePersonName(name)) ?? [];
    if (matches.length === 1) {
      matches[0].attendanceDates.push(...dates);
      continue;
    }

    const suggestions = closestNames(name, students.map((student) => student.name)).map((item) => item.candidate);
    unmatchedAttendanceRows.push({ sourceRow: row, name, normalizedName: normalizePersonName(name), dates, suggestions });
    if (dates.length > 0) {
      issues.push({
        code: "ATTENDANCE_WITHOUT_STUDENT",
        message: `${dates.length} presença(s) sem aluno exato na linha ${row} da aba Out`,
        blocking: true,
        sourceRow: row
      });
    }
  }

  issues.push(...sanityIssues(students, sourceAttendanceCount));
  const notEnrolled = students.filter((student) => student.status === "NOT_ENROLLED");
  if (notEnrolled.length > 0) {
    issues.push({
      code: "STATUS_COLOR_SPEC_MISMATCH",
      message: "O único candidato a 'ainda não matriculado' usa preenchimento C0C0C0, não verde-escuro como documentado; exige confirmação antes do apply",
      blocking: true,
      sourceRow: notEnrolled[0].sourceRow
    });
  }
  return { students, sourceAttendanceCount, unmatchedAttendanceRows, modalityLabels, issues };
}

function conservativeProbableMatch(source: OctoberSourceStudent, existing: ExistingStudentSnapshot[]) {
  const phoneMatches = source.normalizedPhone
    ? existing.filter((student) => normalizePhone(student.phone) === source.normalizedPhone)
    : [];
  if (phoneMatches.length === 1) return phoneMatches[0];
  if (phoneMatches.length > 1) return null;

  const ranked = closestNames(source.name, existing.map((student) => student.name), 2);
  if (!ranked[0] || ranked[0].ratio > 0.12) return undefined;
  if (ranked[1] && ranked[1].ratio - ranked[0].ratio < 0.08) return null;
  return existing.find((student) => student.name === ranked[0].candidate);
}

function desiredStatus(status: SourceStudentStatus) {
  return status === "ACTIVE" ? "ATIVO" : "INATIVO";
}

export function buildOctoberDryRunPlan(parsed: ParsedOctoberWorkbook, production: ProductionSnapshot): OctoberDryRunPlan {
  const issues = [...parsed.issues];
  issues.push({
    code: "STUDENT_MONTHLY_VALUE_SCHEMA_MISSING",
    message: "Aluno não possui campo nullable de valor mensal; Modalidade.valorPadrao não preserva valores diferentes por aluno",
    blocking: true
  });

  const existingNames = new Map<string, ExistingStudentSnapshot[]>();
  for (const student of production.students) {
    const key = normalizePersonName(student.name);
    const group = existingNames.get(key) ?? [];
    group.push(student);
    existingNames.set(key, group);
  }

  const existingModalities = new Map<string, ExistingModalitySnapshot[]>();
  for (const modality of production.modalities) {
    const key = normalizeModalityKey(modality.name);
    const group = existingModalities.get(key) ?? [];
    group.push(modality);
    existingModalities.set(key, group);
  }

  const modalityRows: ModalityDryRunRow[] = [];
  for (const [key, labels] of parsed.modalityLabels) {
    const sourceStudents = parsed.students.filter((student) => student.modalityKey === key);
    const values = [...new Set(sourceStudents.map((student) => student.monthlyValue).filter((value): value is number => value !== null))].sort((a, b) => a - b);
    const matches = existingModalities.get(key) ?? [];
    let action: ModalityDryRunRow["action"] = "CRIAR";
    let existingName: string | null = null;
    let observation = "Modalidade nova preservando a nomenclatura da fonte";
    if (matches.length === 1) {
      action = "REUTILIZAR";
      existingName = matches[0].name;
      observation = "Correspondência por normalização de caixa, espaços e acentos";
    } else if (matches.length > 1 || key === "3xnusc" || values.length > 1) {
      action = "REVISAR";
      observation = matches.length > 1
        ? "Mais de uma modalidade existente corresponde ao mesmo nome normalizado"
        : key === "3xnusc"
          ? "Possível erro de digitação; não será fundido automaticamente"
          : "A mesma modalidade possui valores mensais diferentes e não cabe em valorPadrao";
      issues.push({ code: "UNRESOLVED_MODALITY", message: `${[...labels].join(" / ")}: ${observation}`, blocking: true });
    }
    if (values.length === 0) {
      action = "REVISAR";
      observation = "Sem valor confiável para preencher Modalidade.valorPadrao";
      issues.push({ code: "MODALITY_WITHOUT_VALUE", message: `${[...labels].join(" / ")}: modalidade sem valor padrão confiável`, blocking: true });
    }
    modalityRows.push({ key, sourceLabels: [...labels].sort(), sourceStudents: sourceStudents.length, sourceValues: values, existingName, action, observation });
  }

  const existingAttendance = new Set(production.attendance.map((item) => `${item.studentId}:${item.date}`));
  const studentRows: StudentDryRunRow[] = [];
  for (const source of parsed.students) {
    const exact = existingNames.get(source.normalizedName) ?? [];
    let match: ProductionMatch;
    let matched: ExistingStudentSnapshot | null = null;
    let observation = "";
    if (exact.length === 1) {
      match = "EXISTENTE_EXATO";
      matched = exact[0];
    } else if (exact.length > 1) {
      match = "AMBIGUO";
      observation = "Mais de um aluno existente possui o mesmo nome normalizado";
    } else {
      const probable = conservativeProbableMatch(source, production.students);
      if (probable === null) {
        match = "AMBIGUO";
        observation = "Telefone ou similaridade aponta para mais de um cadastro";
      } else if (probable) {
        match = "EXISTENTE_PROVAVEL";
        matched = probable;
        observation = "Correspondência provável; revisão humana obrigatória antes de atualizar";
      } else {
        match = "NOVO";
        observation = "Novo aluno sem data de início confiável na fonte";
      }
    }

    if (match === "AMBIGUO" || match === "EXISTENTE_PROVAVEL") {
      issues.push({ code: "STUDENT_REQUIRES_REVIEW", message: `Aluno da linha ${source.sourceRow} exige revisão de matching`, blocking: true, sourceRow: source.sourceRow });
    }

    const existingCount = matched
      ? source.attendanceDates.filter((date) => existingAttendance.has(`${matched!.id}:${date}`)).length
      : 0;
    const newCount = source.attendanceDates.length - existingCount;
    let action: PlannedAction = match === "NOVO" ? "CRIAR" : match === "EXISTENTE_EXATO" ? "ATUALIZAR" : "REVISAR";
    if (match === "EXISTENTE_EXATO" && matched) {
      const unchanged = normalizePhone(matched.phone) === source.normalizedPhone
        && matched.dueDay === source.dueDay
        && matched.status === desiredStatus(source.status)
        && normalizeModalityKey(matched.modalityName) === source.modalityKey;
      if (unchanged && newCount === 0) action = "PULAR";
    }
    studentRows.push({
      ...source,
      match,
      matchedStudentId: matched?.id ?? null,
      matchedStudentName: matched?.name ?? null,
      action,
      existingAttendance: existingCount,
      newAttendance: newCount,
      observation
    });
  }

  const exactMatches = studentRows.filter((row) => row.match === "EXISTENTE_EXATO").length;
  const probableMatches = studentRows.filter((row) => row.match === "EXISTENTE_PROVAVEL").length;
  const newStudents = studentRows.filter((row) => row.match === "NOVO").length;
  const ambiguousStudents = studentRows.filter((row) => row.match === "AMBIGUO").length;
  if (newStudents > 0) {
    issues.push({
      code: "NEW_STUDENTS_WITHOUT_START_DATE",
      message: `${newStudents} aluno(s) novo(s) sem data de início confiável; Aluno.dataInicio é obrigatório`,
      blocking: true
    });
  }
  const existingAttendanceCount = studentRows.reduce((total, row) => total + row.existingAttendance, 0);
  const newAttendanceCount = studentRows.reduce((total, row) => total + row.newAttendance, 0);
  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}:${issue.sourceRow ?? ""}:${issue.message}`, issue])).values()];

  return {
    summary: {
      sourceStudents: parsed.students.length,
      exactMatches,
      probableMatches,
      newStudents,
      ambiguousStudents,
      active: countByStatus(parsed.students, "ACTIVE"),
      inactive: countByStatus(parsed.students, "INACTIVE"),
      notEnrolled: countByStatus(parsed.students, "NOT_ENROLLED"),
      withoutMonthlyValue: parsed.students.filter((student) => student.status === "ACTIVE" && student.monthlyValue === null).length,
      modalitiesFound: parsed.modalityLabels.size,
      sourceAttendance: parsed.sourceAttendanceCount,
      existingAttendance: existingAttendanceCount,
      newAttendance: newAttendanceCount,
      duplicatesPrevented: existingAttendanceCount,
      errors: uniqueIssues.length,
      blockers: uniqueIssues.filter((issue) => issue.blocking).length
    },
    students: studentRows,
    modalities: modalityRows.sort((left, right) => left.key.localeCompare(right.key)),
    unmatchedAttendanceRows: parsed.unmatchedAttendanceRows,
    issues: uniqueIssues
  };
}

export function createOctoberDryRunWorkbook(plan: OctoberDryRunPlan) {
  const workbook = XLSX.utils.book_new();
  const summaryRows = Object.entries(plan.summary).map(([item, value]) => ({ Item: item, Valor: value }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Resumo");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.students.map((student) => ({
    Nome: student.name,
    Telefone: student.phone ?? "",
    Modalidade: student.sourceModality,
    Vencimento: student.dueDay,
    Status: student.status,
    "Valor mensal": student.monthlyValue ?? "",
    "Nº de presenças em outubro": student.attendanceDates.length,
    "Datas de presença": student.attendanceDates.map((date) => `${date.slice(8, 10)}/10`).join(", "),
    "Match produção": student.match,
    "Ação prevista": student.action,
    Observação: student.observation
  }))), "Alunos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.modalities.map((modality) => ({
    Chave: modality.key,
    "Nomes na fonte": modality.sourceLabels.join(" / "),
    Alunos: modality.sourceStudents,
    Valores: modality.sourceValues.join(" / "),
    "Modalidade existente": modality.existingName ?? "",
    Ação: modality.action,
    Observação: modality.observation
  }))), "Modalidades");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.unmatchedAttendanceRows.map((row) => ({
    Linha: row.sourceRow,
    Nome: row.name,
    Presenças: row.dates.length,
    Datas: row.dates.map((date) => `${date.slice(8, 10)}/10`).join(", "),
    Sugestões: row.suggestions.join(" / ")
  }))), "Presenças sem vínculo");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.issues.map((issue) => ({
    Código: issue.code,
    Bloqueia: issue.blocking ? "SIM" : "NÃO",
    Linha: issue.sourceRow ?? "",
    Mensagem: issue.message
  }))), "Erros e bloqueios");
  return workbook;
}
