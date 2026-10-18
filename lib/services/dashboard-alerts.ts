import { AlunoStatus, MensalidadeStatus, PagamentoStatus, Prisma } from "@prisma/client";
import { prismaDateToCivil } from "@/lib/attendance-date";
import { monthlyAmounts } from "@/lib/services/monthly-payments";

export const OVERDUE_FEE_ALERT_DAYS = 5;
export const NO_ATTENDANCE_ALERT_DAYS = 7;

const DAY_MS = 86_400_000;

export function civilDaysBetween(later: string, earlier: string) {
  const [laterYear, laterMonth, laterDay] = later.split("-").map(Number);
  const [earlierYear, earlierMonth, earlierDay] = earlier.split("-").map(Number);
  return Math.floor((Date.UTC(laterYear, laterMonth - 1, laterDay) - Date.UTC(earlierYear, earlierMonth - 1, earlierDay)) / DAY_MS);
}

export type OverdueFeeAlert = {
  mensalidadeId: string;
  alunoId: string;
  nome: string;
  competencia: string;
  vencimento: string;
  saldo: number;
  diasAtraso: number;
};

export type AlertMonthlyRow = {
  id: string;
  alunoId: string;
  competencia: string;
  valor: Prisma.Decimal | number | string;
  valorFinal?: Prisma.Decimal | number | string | null;
  vencimento: Date;
  status: MensalidadeStatus;
  pagamentos?: Array<{ valor: Prisma.Decimal | number | string; status: PagamentoStatus }>;
  aluno: { nomeCompleto: string };
};

export function buildOverdueFeeAlerts(rows: AlertMonthlyRow[], today: string): OverdueFeeAlert[] {
  return rows.flatMap((row) => {
    if (row.status === MensalidadeStatus.PAGO || row.status === MensalidadeStatus.ISENTO) return [];
    const dueDate = prismaDateToCivil(row.vencimento);
    const overdueDays = civilDaysBetween(today, dueDate);
    const balance = monthlyAmounts(row).balance;
    if (overdueDays < OVERDUE_FEE_ALERT_DAYS || balance.lte(0)) return [];
    return [{
      mensalidadeId: row.id,
      alunoId: row.alunoId,
      nome: row.aluno.nomeCompleto,
      competencia: row.competencia,
      vencimento: dueDate,
      saldo: Number(balance),
      diasAtraso: overdueDays
    }];
  }).sort((left, right) => right.diasAtraso - left.diasAtraso || left.nome.localeCompare(right.nome, "pt-BR"));
}

export type AbsenceAlert = {
  alunoId: string;
  nome: string;
  fotoPath: string | null;
  ultimaPresenca: string | null;
  dataInicio: string | null;
  diasSemPresenca: number;
};

export type AttendanceAlertStudent = {
  id: string;
  nomeCompleto: string;
  fotoPath: string | null;
  status: AlunoStatus;
  presencas: Array<{ data: Date }>;
  periodosMatricula: Array<{ dataInicio: Date | null; dataSaida: Date | null }>;
};

export type AbsenceAlertResult = {
  alerts: AbsenceAlert[];
  activeWithoutOpenPeriod: string[];
  activeWithMultipleOpenPeriods: string[];
};

export function buildAbsenceAlerts(students: AttendanceAlertStudent[], today: string): AbsenceAlertResult {
  const result: AbsenceAlertResult = { alerts: [], activeWithoutOpenPeriod: [], activeWithMultipleOpenPeriods: [] };

  for (const student of students) {
    if (student.status !== AlunoStatus.ATIVO) continue;
    const openPeriods = student.periodosMatricula.filter((period) =>
      period.dataSaida === null && (!period.dataInicio || prismaDateToCivil(period.dataInicio) <= today)
    );
    if (openPeriods.length === 0) result.activeWithoutOpenPeriod.push(student.id);
    if (openPeriods.length > 1) result.activeWithMultipleOpenPeriods.push(student.id);

    const lastAttendance = student.presencas[0]?.data ?? null;
    const currentPeriod = openPeriods
      .filter((period) => period.dataInicio)
      .sort((left, right) => prismaDateToCivil(right.dataInicio!).localeCompare(prismaDateToCivil(left.dataInicio!)))[0];
    const reference = lastAttendance ?? currentPeriod?.dataInicio ?? null;
    if (!reference) continue;

    const referenceDate = prismaDateToCivil(reference);
    const days = civilDaysBetween(today, referenceDate);
    if (days < NO_ATTENDANCE_ALERT_DAYS) continue;
    result.alerts.push({
      alunoId: student.id,
      nome: student.nomeCompleto,
      fotoPath: student.fotoPath,
      ultimaPresenca: lastAttendance ? referenceDate : null,
      dataInicio: lastAttendance ? null : referenceDate,
      diasSemPresenca: days
    });
  }

  result.alerts.sort((left, right) => right.diasSemPresenca - left.diasSemPresenca || left.nome.localeCompare(right.nome, "pt-BR"));
  return result;
}
