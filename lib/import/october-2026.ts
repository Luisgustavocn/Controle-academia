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

const MANUAL_STUDENT_ALIASES: Record<string, string> = {
  "adelar de cezaro": "adelar decezaro",
  "andressa da rosa": "andressa de souza rosa",
  "javier gonzalez": "javier gonsalez",
  "kevin picoli": "kevin picolli"
};

const MODALITY_NAMES: Record<string, string> = {
  "1xfuncional": "1x Funcional",
  "1xfuncionalkids": "1x Funcional Kids",
  "1xfut": "1x Futebol",
  "1xmusc": "1x Musculação",
  "2xfuncional": "2x Funcional",
  "2xfuncionalkids": "2x Funcional Kids",
  "2xpersonal": "2x Personal",
  "2xpersonal1xmusc": "2x Personal + 1x Musculação",
  "2xpersonal1xsozinha": "2x Personal + 1x Sozinha",
  "2xpersonal1xsozinho": "2x Personal + 1x Sozinho",
  "2xpersonal2xfuncional": "2x Personal + 2x Funcional",
  "2xpersonal2xsozinha": "2x Personal + 2x Sozinha",
  "2xpersonal2xsozinho": "2x Personal + 2x Sozinho",
  "2xpersonal3xsozinho": "2x Personal + 3x Sozinho",
  "3xmusc": "3x Musculação",
  "3xmusc2xfuncional": "3x Musculação + 2x Funcional",
  "3xpersonal": "3x Personal",
  "3xpersonal1funcional": "3x Personal + 1x Funcional",
  "3xpersonal1xsozinho": "3x Personal + 1x Sozinho",
  "3xpersonal2xsozinha": "3x Personal + 2x Sozinha",
  "futtodososdias": "Futebol + Todos os Dias",
  "todososdias": "Todos os Dias"
};

const APPROVED_DEFAULT_VALUES: Record<string, number | null | undefined> = {
  "1xfuncional": null,
  "2xpersonal": 290,
  "2xpersonal2xfuncional": null,
  "3xpersonal": 350
};

const STUDENTS_WITHOUT_AUTOMATIC_VALUE = new Set([
  "diego roberto dos santos",
  "luis henrique arruda da silva",
  "elisiane de fatima cuchinski"
]);

export type SourceStudentStatus = "ACTIVE" | "INACTIVE" | "NOT_ENROLLED";
export type ProductionMatch = "EXISTENTE_EXATO" | "MATCH_MANUAL_APROVADO" | "NOVO" | "AMBIGUO";
export type PlannedAction = "CRIAR" | "ATUALIZAR" | "PULAR" | "REVISAR";
export type PlannedEnrollmentAction = "CRIAR_ABERTO" | "REUTILIZAR_ABERTO" | "NENHUM" | "CONFLITO";

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
  approvedAttendanceAliases: string[];
};

export type ExistingStudentSnapshot = {
  id: string;
  name: string;
  phone: string;
  dueDay: number;
  status: string;
  modalityId: string | null;
  modalityName: string | null;
  enrollments: Array<{
    id: string;
    startDate: string | null;
    exitDate: string | null;
    modalityId: string | null;
    monthlyValue: number | null;
    useDefaultValue: boolean;
    dueDay: number;
  }>;
};

export type ExistingModalitySnapshot = {
  id: string;
  name: string;
  defaultValue: number | null;
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
  plannedStatus: "ATIVO" | "INATIVO";
  plannedModalityName: string;
  plannedMonthlyValue: number | null;
  plannedUseDefaultValue: boolean;
  plannedStartDate: null;
  plannedExitDate: null;
  plannedEnrollmentOpen: boolean;
  plannedEnrollmentAction: PlannedEnrollmentAction;
  attendanceOutsideEnrollment: number;
  blockingReason: string;
};

export type ModalityDryRunRow = {
  key: string;
  sourceLabels: string[];
  sourceStudents: number;
  sourceValues: number[];
  existingName: string | null;
  plannedName: string;
  plannedDefaultValue: number | null;
  action: "REUTILIZAR" | "CRIAR" | "REVISAR";
  observation: string;
};

export type OctoberDryRunSummary = {
  sourceStudents: number;
  exactMatches: number;
  approvedAliases: number;
  newStudents: number;
  ambiguousStudents: number;
  sourceActive: number;
  sourceInactive: number;
  active: number;
  inactive: number;
  notEnrolled: number;
  withoutMonthlyValue: number;
  modalitiesFound: number;
  modalitiesReused: number;
  modalitiesCreated: number;
  modalitiesPending: number;
  periodsToCreate: number;
  openPeriods: number;
  closedPeriods: number;
  studentsWithoutOpenPeriod: number;
  periodConflicts: number;
  sourceAttendance: number;
  unmatchedAttendance: number;
  linkedAttendance: number;
  attendanceOutsideEnrollment: number;
  existingAttendance: number;
  newAttendance: number;
  duplicatesPrevented: number;
  secondRunStudentsToCreate: number;
  secondRunModalitiesToCreate: number;
  secondRunPeriodsToCreate: number;
  secondRunAttendanceToCreate: number;
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

function canonicalModalityKey(value: unknown) {
  const key = normalizeModalityKey(value);
  if (key === "3xnusc" || key === "3xmusculacao") return "3xmusc";
  if (key === "2xpersonal1sozinho") return "2xpersonal1xsozinho";
  return key;
}

function approvedPersonKey(value: unknown) {
  const key = normalizePersonName(value);
  return MANUAL_STUDENT_ALIASES[key] ?? key;
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
    const modalityKey = canonicalModalityKey(sourceModality);
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
  const approvedAttendanceAliases = new Set<string>();
  for (let row = 5; row <= 196; row += 1) {
    const name = cellText(attendanceSheet, row, 1);
    if (!name) continue;
    const dates = dayColumns
      .filter(({ column }) => String(cellAt(attendanceSheet, row, column)?.v ?? "").trim() === "1")
      .map(({ day }) => `2026-10-${String(day).padStart(2, "0")}`);
    sourceAttendanceCount += dates.length;
    const approvedKey = approvedPersonKey(name);
    const matches = names.get(approvedKey) ?? [];
    if (matches.length === 1) {
      if (approvedKey !== normalizePersonName(name)) approvedAttendanceAliases.add(normalizePersonName(name));
      matches[0].attendanceDates.push(...dates);
      continue;
    }

    const suggestions = closestNames(name, students.map((student) => student.name)).map((item) => item.candidate);
    if (dates.length > 0) {
      unmatchedAttendanceRows.push({ sourceRow: row, name, normalizedName: normalizePersonName(name), dates, suggestions });
      issues.push({
        code: "ATTENDANCE_WITHOUT_STUDENT",
        message: `${dates.length} presença(s) sem aluno exato na linha ${row} da aba Out`,
        blocking: true,
        sourceRow: row
      });
    }
  }

  issues.push(...sanityIssues(students, sourceAttendanceCount));
  return { students, sourceAttendanceCount, unmatchedAttendanceRows, modalityLabels, issues, approvedAttendanceAliases: [...approvedAttendanceAliases] };
}

function conservativePossibleMatch(source: OctoberSourceStudent, existing: ExistingStudentSnapshot[]) {
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

function desiredStatus(student: OctoberSourceStudent) {
  if (student.normalizedName === "marileia da silva") return "ATIVO" as const;
  return student.status === "ACTIVE" ? "ATIVO" as const : "INATIVO" as const;
}

export function buildOctoberDryRunPlan(parsed: ParsedOctoberWorkbook, production: ProductionSnapshot): OctoberDryRunPlan {
  const issues = [...parsed.issues];

  const existingNames = new Map<string, ExistingStudentSnapshot[]>();
  for (const student of production.students) {
    const key = normalizePersonName(student.name);
    const group = existingNames.get(key) ?? [];
    group.push(student);
    existingNames.set(key, group);
  }

  const existingModalities = new Map<string, ExistingModalitySnapshot[]>();
  for (const modality of production.modalities) {
    const key = canonicalModalityKey(modality.name);
    const group = existingModalities.get(key) ?? [];
    group.push(modality);
    existingModalities.set(key, group);
  }

  const modalityRows: ModalityDryRunRow[] = [];
  for (const [key, labels] of parsed.modalityLabels) {
    const sourceStudents = parsed.students.filter((student) => student.modalityKey === key);
    const values = [...new Set(sourceStudents.map((student) => student.monthlyValue).filter((value): value is number => value !== null))].sort((a, b) => a - b);
    const matches = existingModalities.get(key) ?? [];
    const plannedName = MODALITY_NAMES[key];
    let action: ModalityDryRunRow["action"] = "CRIAR";
    let existingName: string | null = null;
    let observation = "Modalidade nova com nome normalizado e valores individuais preservados";
    if (matches.length === 1) {
      action = "REUTILIZAR";
      existingName = matches[0].name;
      observation = "Correspondência aprovada; o preço padrão existente será preservado quando não houver decisão explícita";
    } else if (matches.length > 1 || !plannedName) {
      action = "REVISAR";
      observation = matches.length > 1
        ? "Mais de uma modalidade existente corresponde ao mesmo nome normalizado"
        : "Modalidade sem decisão de nomenclatura aprovada";
      issues.push({ code: "UNRESOLVED_MODALITY", message: `${[...labels].join(" / ")}: ${observation}`, blocking: true });
    }
    const hasApprovedDefault = Object.prototype.hasOwnProperty.call(APPROVED_DEFAULT_VALUES, key);
    const plannedDefaultValue = hasApprovedDefault
      ? APPROVED_DEFAULT_VALUES[key] ?? null
      : matches.length === 1
        ? matches[0].defaultValue
        : null;
    modalityRows.push({
      key,
      sourceLabels: [...labels].sort(),
      sourceStudents: sourceStudents.length,
      sourceValues: values,
      existingName,
      plannedName: plannedName ?? [...labels][0],
      plannedDefaultValue,
      action,
      observation
    });
  }
  const plannedModalities = new Map(modalityRows.map((row) => [row.key, row]));

  const existingAttendance = new Set(production.attendance.map((item) => `${item.studentId}:${item.date}`));
  const studentRows: StudentDryRunRow[] = [];
  for (const source of parsed.students) {
    const sourceKey = normalizePersonName(source.name);
    const approvedMatchKey = approvedPersonKey(source.name);
    const exact = existingNames.get(sourceKey) ?? [];
    const approvedManual = approvedMatchKey === sourceKey ? [] : existingNames.get(approvedMatchKey) ?? [];
    let match: ProductionMatch;
    let matched: ExistingStudentSnapshot | null = null;
    let observation = "";
    if (exact.length === 1) {
      match = "EXISTENTE_EXATO";
      matched = exact[0];
    } else if (exact.length > 1) {
      match = "AMBIGUO";
      observation = "Mais de um aluno existente possui o mesmo nome normalizado";
    } else if (approvedManual.length === 1) {
      match = "MATCH_MANUAL_APROVADO";
      matched = approvedManual[0];
      observation = "MATCH MANUAL APROVADO";
    } else if (approvedManual.length > 1) {
      match = "AMBIGUO";
      observation = "Alias aprovado encontra mais de um cadastro de produção";
    } else {
      const probable = conservativePossibleMatch(source, production.students);
      if (probable === null) {
        match = "AMBIGUO";
        observation = "Telefone ou similaridade aponta para mais de um cadastro";
      } else if (probable) {
        match = "AMBIGUO";
        observation = "Possível correspondência fora dos aliases aprovados; nenhuma associação automática";
      } else {
        match = "NOVO";
        observation = "Novo aluno sem data de início confiável na fonte";
      }
    }

    if (match === "AMBIGUO") {
      issues.push({ code: "STUDENT_REQUIRES_REVIEW", message: `Aluno da linha ${source.sourceRow} exige revisão de matching`, blocking: true, sourceRow: source.sourceRow });
    }

    const existingCount = matched
      ? source.attendanceDates.filter((date) => existingAttendance.has(`${matched!.id}:${date}`)).length
      : 0;
    const newCount = source.attendanceDates.length - existingCount;
    let action: PlannedAction = match === "NOVO" ? "CRIAR" : match === "AMBIGUO" ? "REVISAR" : "ATUALIZAR";
    const plannedStatus = desiredStatus(source);
    const plannedModality = plannedModalities.get(source.modalityKey);
    const withoutAutomaticValue = STUDENTS_WITHOUT_AUTOMATIC_VALUE.has(source.normalizedName);
    const plannedMonthlyValue = withoutAutomaticValue ? null : source.monthlyValue;
    const plannedUseDefaultValue = false;
    const openEnrollments = matched?.enrollments.filter((period) => period.exitDate === null) ?? [];
    let plannedEnrollmentAction: PlannedEnrollmentAction = "NENHUM";
    let blockingReason = "";
    if (plannedStatus === "ATIVO") {
      if (openEnrollments.length === 0) plannedEnrollmentAction = "CRIAR_ABERTO";
      else if (openEnrollments.length === 1) plannedEnrollmentAction = "REUTILIZAR_ABERTO";
      else {
        plannedEnrollmentAction = "CONFLITO";
        blockingReason = "Mais de um período aberto já existe para o aluno";
      }
    } else if (openEnrollments.length > 0) {
      plannedEnrollmentAction = "CONFLITO";
      blockingReason = "Aluno fora em outubro possui período aberto em produção";
    }
    const plannedEnrollmentOpen = plannedStatus === "ATIVO" && plannedEnrollmentAction !== "CONFLITO";
    const attendanceOutsideEnrollment = source.attendanceDates.length > 0 && !plannedEnrollmentOpen
      ? source.attendanceDates.length
      : 0;
    if (blockingReason) {
      issues.push({ code: "ENROLLMENT_CONFLICT", message: `${source.name}: ${blockingReason}`, blocking: true, sourceRow: source.sourceRow });
    }
    if (attendanceOutsideEnrollment > 0) {
      issues.push({ code: "ATTENDANCE_OUTSIDE_ENROLLMENT", message: `${source.name}: presença fora do período proposto`, blocking: true, sourceRow: source.sourceRow });
    }
    if ((match === "EXISTENTE_EXATO" || match === "MATCH_MANUAL_APROVADO") && matched) {
      const unchanged = normalizePhone(matched.phone) === source.normalizedPhone
        && matched.dueDay === source.dueDay
        && matched.status === plannedStatus
        && canonicalModalityKey(matched.modalityName) === source.modalityKey;
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
      observation,
      plannedStatus,
      plannedModalityName: plannedModality?.plannedName ?? source.sourceModality,
      plannedMonthlyValue,
      plannedUseDefaultValue,
      plannedStartDate: null,
      plannedExitDate: null,
      plannedEnrollmentOpen,
      plannedEnrollmentAction,
      attendanceOutsideEnrollment,
      blockingReason
    });
  }

  const exactMatches = studentRows.filter((row) => row.match === "EXISTENTE_EXATO").length;
  const approvedAliases = studentRows.filter((row) => row.match === "MATCH_MANUAL_APROVADO").length;
  const newStudents = studentRows.filter((row) => row.match === "NOVO").length;
  const ambiguousStudents = studentRows.filter((row) => row.match === "AMBIGUO").length;
  const existingAttendanceCount = studentRows.reduce((total, row) => total + row.existingAttendance, 0);
  const newAttendanceCount = studentRows.reduce((total, row) => total + row.newAttendance, 0);
  const unmatchedAttendanceCount = parsed.unmatchedAttendanceRows.reduce((total, row) => total + row.dates.length, 0);
  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}:${issue.sourceRow ?? ""}:${issue.message}`, issue])).values()];

  return {
    summary: {
      sourceStudents: parsed.students.length,
      exactMatches,
      approvedAliases: approvedAliases + parsed.approvedAttendanceAliases.length,
      newStudents,
      ambiguousStudents,
      sourceActive: countByStatus(parsed.students, "ACTIVE"),
      sourceInactive: countByStatus(parsed.students, "INACTIVE"),
      active: studentRows.filter((row) => row.plannedStatus === "ATIVO").length,
      inactive: studentRows.filter((row) => row.plannedStatus === "INATIVO").length,
      notEnrolled: countByStatus(parsed.students, "NOT_ENROLLED"),
      withoutMonthlyValue: parsed.students.filter((student) => student.status === "ACTIVE" && student.monthlyValue === null).length,
      modalitiesFound: parsed.modalityLabels.size,
      modalitiesReused: modalityRows.filter((row) => row.action === "REUTILIZAR").length,
      modalitiesCreated: modalityRows.filter((row) => row.action === "CRIAR").length,
      modalitiesPending: modalityRows.filter((row) => row.action === "REVISAR").length,
      periodsToCreate: studentRows.filter((row) => row.plannedEnrollmentAction === "CRIAR_ABERTO").length,
      openPeriods: studentRows.filter((row) => row.plannedEnrollmentOpen).length,
      closedPeriods: studentRows.reduce((total, row) => total + (row.matchedStudentId ? production.students.find((item) => item.id === row.matchedStudentId)?.enrollments.filter((period) => period.exitDate !== null).length ?? 0 : 0), 0),
      studentsWithoutOpenPeriod: studentRows.filter((row) => !row.plannedEnrollmentOpen).length,
      periodConflicts: studentRows.filter((row) => row.plannedEnrollmentAction === "CONFLITO").length,
      sourceAttendance: parsed.sourceAttendanceCount,
      unmatchedAttendance: unmatchedAttendanceCount,
      linkedAttendance: parsed.sourceAttendanceCount - unmatchedAttendanceCount,
      attendanceOutsideEnrollment: studentRows.reduce((total, row) => total + row.attendanceOutsideEnrollment, 0),
      existingAttendance: existingAttendanceCount,
      newAttendance: newAttendanceCount,
      duplicatesPrevented: existingAttendanceCount,
      secondRunStudentsToCreate: 0,
      secondRunModalitiesToCreate: 0,
      secondRunPeriodsToCreate: 0,
      secondRunAttendanceToCreate: 0,
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
    "Status fonte": student.status,
    "Status final": student.plannedStatus,
    "Modalidade fonte": student.sourceModality,
    "Modalidade final": student.plannedModalityName,
    "Valor individual": student.plannedMonthlyValue ?? "",
    "Usa padrão": student.plannedUseDefaultValue ? "SIM" : "NÃO",
    "Valor padrão modalidade": plan.modalities.find((item) => item.key === student.modalityKey)?.plannedDefaultValue ?? "",
    Vencimento: student.dueDay,
    "Data início período": student.plannedStartDate ?? "",
    "Data saída período": student.plannedExitDate ?? "",
    "Período aberto?": student.plannedEnrollmentOpen ? "SIM" : "NÃO",
    "Nº de presenças em outubro": student.attendanceDates.length,
    "Datas de presença": student.attendanceDates.map((date) => `${date.slice(8, 10)}/10`).join(", "),
    "Match produção": student.match,
    "Ação proposta": `${student.action} / ${student.plannedEnrollmentAction}`,
    Bloqueio: student.blockingReason,
    Observação: student.observation
  }))), "Alunos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.modalities.map((modality) => ({
    Chave: modality.key,
    "Nomes na fonte": modality.sourceLabels.join(" / "),
    Alunos: modality.sourceStudents,
    Valores: modality.sourceValues.join(" / "),
    "Modalidade existente": modality.existingName ?? "",
    "Nome planejado": modality.plannedName,
    "Valor padrão planejado": modality.plannedDefaultValue ?? "",
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
