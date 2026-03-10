import { UserRole } from "@prisma/client";
import { createListCreateHandlers } from "@/lib/api/crud";

function normalizeHorario(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  const compact = value.replace(/\s+/g, "");
  const match = /^(\d{1,2})(?:[:hH]?(\d{2}))?$/.exec(compact);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "00");
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isHorarioAtendimento(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  if (minute !== 0) return false;
  const total = hour * 60 + minute;

  const morning = total >= 6 * 60 && total <= 10 * 60;
  const afternoon = total >= 15 * 60 && total <= 21 * 60;
  return morning || afternoon;
}

export const { GET, POST } = createListCreateHandlers({
  model: "agendaPersonal",
  module: "agenda-personal",
  requiredRole: UserRole.PERSONAL,
  searchFields: ["professor", "horario", "alunoNome", "observacao"],
  relationInclude: {
    aluno: { select: { nomeCompleto: true } }
  },
  intFields: ["diaSemana"],
  booleanFields: ["ativo"],
  validate: (data, mode) => {
    const horario = data.horario;
    if (mode === "create" && (horario === undefined || horario === null || String(horario).trim() === "")) {
      return "Horário é obrigatório";
    }

    if (horario !== undefined) {
      const normalizedHorario = normalizeHorario(horario);
      if (!normalizedHorario) {
        return "Horário inválido. Use formato HH:mm";
      }
      if (!isHorarioAtendimento(normalizedHorario)) {
        return "Horário inválido. Use somente horas cheias entre 06:00-10:00 ou 15:00-21:00";
      }
      data.horario = normalizedHorario;
    }

    const dia = data.diaSemana;
    if (mode === "create" && (dia === undefined || dia === null || dia === "")) {
      return "diaSemana é obrigatório";
    }

    if (dia !== undefined) {
      const diaValue = Number(dia);
      if (!Number.isInteger(diaValue) || diaValue < 1 || diaValue > 6) {
        return "diaSemana deve ser um número entre 1 e 6";
      }
    }

    const alunoId = data.alunoId === undefined || data.alunoId === null ? "" : String(data.alunoId).trim();
    const alunoNome = data.alunoNome === undefined || data.alunoNome === null ? "" : String(data.alunoNome).trim();

    if (mode === "create" && !alunoId && !alunoNome) {
      return "Selecione um aluno ou preencha o campo Aluno (texto livre)";
    }

    if (data.alunoId !== undefined) {
      data.alunoId = alunoId || null;
    }
    if (data.alunoNome !== undefined) {
      data.alunoNome = alunoNome || null;
    }

    if (mode === "update" && data.alunoId === null && (data.alunoNome === null || data.alunoNome === undefined)) {
      return "Selecione um aluno ou preencha o campo Aluno (texto livre)";
    }

    return null;
  },
  queryFilters: (request) => {
    const professor = request.nextUrl.searchParams.get("professor");
    return {
      ...(professor ? { professor } : {})
    };
  }
});
