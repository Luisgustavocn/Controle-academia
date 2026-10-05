import { ACADEMY_TIME_ZONE, getAcademyDateContext } from "@/lib/timezone";

export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CivilDateValidationError extends Error {}

export function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function parseCivilDate(value: unknown): string {
  const dateKey = String(value ?? "").trim();
  if (!isCivilDate(dateKey)) throw new CivilDateValidationError("data inválida. Use YYYY-MM-DD");
  return dateKey;
}

/** Prisma materializes PostgreSQL DATE as a Date. UTC fields preserve its literal calendar value. */
export function civilDateToPrisma(dateKey: string): Date {
  const parsed = parseCivilDate(dateKey);
  return new Date(`${parsed}T00:00:00.000Z`);
}

export function prismaDateToCivil(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function academyToday(referenceDate = new Date()): string {
  return getAcademyDateContext(referenceDate).dateKey;
}

export function compareCivilDates(left: string, right: string): number {
  return parseCivilDate(left).localeCompare(parseCivilDate(right));
}

export function addCivilDays(dateKey: string, amount: number): string {
  const date = civilDateToPrisma(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return prismaDateToCivil(date);
}

export function civilMonthRange(competencia: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!match) throw new CivilDateValidationError("competência inválida. Use YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new CivilDateValidationError("competência inválida. Use YYYY-MM");
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export function civilDateLabel(dateKey: string): string {
  const [year, month, day] = parseCivilDate(dateKey).split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function relativeCivilDateLabel(dateKey: string, referenceDate = new Date()): string {
  const today = academyToday(referenceDate);
  const parsed = parseCivilDate(dateKey);
  if (parsed === today) return "Hoje";
  if (parsed === addCivilDays(today, -1)) return "Ontem";
  return civilDateLabel(parsed);
}

export function academyTimeZone(): string {
  return ACADEMY_TIME_ZONE;
}
