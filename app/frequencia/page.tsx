"use client";

import { CrudModule } from "@/components/forms/crud-module";
import { ModuleHeader } from "@/components/ui/module-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function FrequenciaPage() {
  const [relatorio, setRelatorio] = useState<string>("");

  return (
    <div className="space-y-4">
      <ModuleHeader title="Frequência" description="Marcação mensal de presença, ranking e alerta de baixa frequência." />

      <Card className="flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            const competencia = prompt("Competência (yyyy-mm)", new Date().toISOString().slice(0, 7));
            if (!competencia) return;
            const res = await fetch(`/api/relatorios/frequencia?competencia=${competencia}`);
            const data = await res.json();
            setRelatorio(JSON.stringify(data, null, 2));
          }}
        >
          Gerar ranking de frequência
        </Button>
      </Card>

      <CrudModule
        endpoint="/api/presencas"
        title="Lançamentos de presença"
        listFields={["data", "horario", "tipoAula", "presente", "alunoId"]}
        fields={[
          { key: "alunoId", label: "ID aluno", required: true },
          { key: "data", label: "Data", type: "date", required: true },
          { key: "horario", label: "Horário" },
          { key: "tipoAula", label: "Tipo aula", required: true },
          {
            key: "presente",
            label: "Presença",
            type: "select",
            options: [
              { label: "Presente", value: "true" },
              { label: "Ausente", value: "false" }
            ]
          },
          { key: "observacao", label: "Observação" }
        ]}
      />

      {relatorio ? (
        <Card>
          <h3 className="mb-2 font-semibold">Relatório mensal de frequência</h3>
          <pre className="overflow-auto text-xs">{relatorio}</pre>
        </Card>
      ) : null}
    </div>
  );
}
