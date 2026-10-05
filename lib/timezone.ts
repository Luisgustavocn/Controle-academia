export const ACADEMY_TIME_ZONE = "America/Sao_Paulo";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone = ACADEMY_TIME_ZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}

function wallTimeToUtc(parts: ZonedParts, timeZone = ACADEMY_TIME_ZONE) {
  const expected = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let result = new Date(expected);

  // Two passes also handle zones whose offset changes around the requested instant.
  for (let pass = 0; pass < 2; pass++) {
    const actual = zonedParts(result, timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    result = new Date(result.getTime() + expected - actualAsUtc);
  }
  return result;
}

function addCalendarDays(parts: Pick<ZonedParts, "year" | "month" | "day">, amount: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export type AcademyDateContext = {
  dateKey: string;
  competencia: string;
  weekday: number;
  weekRef: string;
  dayStart: Date;
  dayEnd: Date;
  monthStart: Date;
  monthEnd: Date;
  label: string;
};

export function isoWeekRef(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getAcademyDateContext(referenceDate = new Date()): AcademyDateContext {
  const current = zonedParts(referenceDate);
  const nextDay = addCalendarDays(current, 1);
  const nextMonth = current.month === 12
    ? { year: current.year + 1, month: 1 }
    : { year: current.year, month: current.month + 1 };
  const pad = (value: number) => String(value).padStart(2, "0");
  const weekday = new Date(Date.UTC(current.year, current.month - 1, current.day)).getUTCDay();

  const rawLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: ACADEMY_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(referenceDate);

  return {
    dateKey: `${current.year}-${pad(current.month)}-${pad(current.day)}`,
    competencia: `${current.year}-${pad(current.month)}`,
    weekday: weekday === 0 ? 7 : weekday,
    weekRef: isoWeekRef(current.year, current.month, current.day),
    dayStart: wallTimeToUtc({ ...current, hour: 0, minute: 0, second: 0 }),
    dayEnd: wallTimeToUtc({ ...nextDay, hour: 0, minute: 0, second: 0 }),
    monthStart: wallTimeToUtc({ year: current.year, month: current.month, day: 1, hour: 0, minute: 0, second: 0 }),
    monthEnd: wallTimeToUtc({ ...nextMonth, day: 1, hour: 0, minute: 0, second: 0 }),
    label: rawLabel.charAt(0).toLocaleUpperCase("pt-BR") + rawLabel.slice(1)
  };
}

export function academyCompetencia(date: Date) {
  const parts = zonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function recentCompetencias(referenceDate = new Date(), total = 12) {
  const current = zonedParts(referenceDate);
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(Date.UTC(current.year, current.month - 1 - (total - index - 1), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function academyMonthRange(competencia: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!match) throw new Error("Competência inválida");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start: wallTimeToUtc({ year, month, day: 1, hour: 0, minute: 0, second: 0 }),
    end: wallTimeToUtc({ ...next, day: 1, hour: 0, minute: 0, second: 0 })
  };
}
