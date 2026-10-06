import { PrismaClient } from "@prisma/client";

type AttendancePreflightRow = {
  total: bigint;
  duplicateGroups: bigint;
  falseRecords: bigint;
  emptyTimes: bigint;
  nullTimes: bigint;
  nonMidnightDates: bigint;
};

export type AttendanceMigrationPreflight = {
  total: number;
  duplicateGroups: number;
  falseRecords: number;
  emptyTimes: number;
  nullTimes: number;
  nonMidnightDates: number;
  safe: boolean;
  blockers: string[];
};

export function evaluateAttendancePreflight(row: AttendancePreflightRow): AttendanceMigrationPreflight {
  const result = {
    total: Number(row.total),
    duplicateGroups: Number(row.duplicateGroups),
    falseRecords: Number(row.falseRecords),
    emptyTimes: Number(row.emptyTimes),
    nullTimes: Number(row.nullTimes),
    nonMidnightDates: Number(row.nonMidnightDates)
  };
  const blockers: string[] = [];
  if (result.duplicateGroups > 0) blockers.push("duplicidades por aluno/dia exigem revisão manual");
  if (result.falseRecords > 0) blockers.push("registros presente=false exigem revisão manual");
  if (result.nonMidnightDates > 0) blockers.push("datas com componente de hora exigem revisão manual");
  return { ...result, safe: blockers.length === 0, blockers };
}

export async function inspectAttendanceMigration(prisma: PrismaClient): Promise<AttendanceMigrationPreflight> {
  const rows = await prisma.$queryRaw<AttendancePreflightRow[]>`
    SELECT
      (SELECT COUNT(*) FROM "Presenca") AS "total",
      (
        SELECT COUNT(*)
        FROM (
          SELECT 1
          FROM "Presenca"
          GROUP BY "alunoId", "data"::date
          HAVING COUNT(*) > 1
        ) duplicates
      ) AS "duplicateGroups",
      (SELECT COUNT(*) FROM "Presenca" WHERE "presente" = false) AS "falseRecords",
      (SELECT COUNT(*) FROM "Presenca" WHERE "horario" IS NOT NULL AND BTRIM("horario") = '') AS "emptyTimes",
      (SELECT COUNT(*) FROM "Presenca" WHERE "horario" IS NULL) AS "nullTimes",
      (
        SELECT COUNT(*)
        FROM "Presenca"
        WHERE ("data"::text)::timestamp::time <> TIME '00:00:00'
      ) AS "nonMidnightDates"
  `;
  const row = rows[0];
  if (!row) throw new Error("Não foi possível auditar Presenca");
  return evaluateAttendancePreflight(row);
}
