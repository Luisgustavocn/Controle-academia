"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";

export default function AgendaPersonalPage() {
  return (
    <div>
      <ModuleHeader title="Agenda de Personal" description="Grade semanal por professor, com edição rápida e impressão." />
      <CrudModule
        endpoint="/api/agenda-personal"
        title="Agenda semanal"
        listFields={["semanaRef", "professor", "diaSemana", "horario", "alunoNome", "tipoAula", "ativo"]}
        fields={[
          { key: "semanaRef", label: "Semana referência (yyyy-Www)", required: true },
          { key: "professor", label: "Professor", required: true },
          { key: "diaSemana", label: "Dia semana (1-6)", type: "number", required: true },
          { key: "horario", label: "Horário", required: true },
          { key: "alunoId", label: "ID aluno" },
          { key: "alunoNome", label: "Aluno (texto livre)" },
          { key: "tipoAula", label: "Tipo aula", required: true },
          { key: "observacao", label: "Observação" },
          {
            key: "ativo",
            label: "Ativo",
            type: "select",
            options: [
              { label: "Sim", value: "true" },
              { label: "Não", value: "false" }
            ]
          }
        ]}
      />
    </div>
  );
}
