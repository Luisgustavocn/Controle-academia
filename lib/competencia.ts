import { format } from "date-fns";

export function toCompetencia(date: Date): string {
  return format(date, "yyyy-MM");
}

export function competenciaToDate(competencia: string): Date {
  const [year, month] = competencia.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function currentCompetencia(): string {
  return toCompetencia(new Date());
}
